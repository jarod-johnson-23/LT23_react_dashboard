import React, { useEffect, useState, useRef, useMemo } from "react";
import io from "socket.io-client";
import "./SowChatBot.css";
import Navbar from "./components/Navbar";
import { API_BASE_URL } from "./config";
import LoadingDots from "./components/LoadingDots";

const SowChatBot = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [userEmail, setUserEmail] = useState(null);
  const [isAssistantResponding, setIsAssistantResponding] = useState(false);
  const [fileMappings, setFileMappings] = useState({});
  const socketRef = useRef(null);
  const firstMessageReceived = useRef(false);
  const inputRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const textarea = inputRef.current;

    const handleInput = () => {
      textarea.style.height = "auto"; // Reset the height
      const newHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.max(
        38,
        Math.min(newHeight - 30, 100)
      )}px`; // Set the new height
    };

    textarea.addEventListener("input", handleInput);

    return () => {
      textarea.removeEventListener("input", handleInput); // Cleanup event listener on unmount
    };
  }, []);

  useEffect(() => {
    const fetchUserEmail = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        console.error("No token found");
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/users/protected`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          setUserEmail(data.logged_in_as);

          // Initialize socket connection with the correct namespace
          socketRef.current = io(`${API_BASE_URL}/assistants`, {
            transports: ["websocket", "polling"], // Ensure WebSocket is supported
            query: { user_id: data.logged_in_as },
          });

          // Safeguard to ensure event listeners are not duplicated
          socketRef.current.off("connected");
          socketRef.current.off("new_message");
          socketRef.current.off("message_done");
          socketRef.current.off("file_created");

          socketRef.current.on("connected", (data) => {
            console.log("Connected:", data);
          });

          socketRef.current.on("file_created", (data) => {
            console.log("File Created: ", data);
            const { filename, file_id } = data;
            setFileMappings((prevMappings) => ({
              ...prevMappings,
              [filename]: file_id,
            }));
          });

          socketRef.current.on("new_message", (message) => {
            console.log("Received message:", message); // Log the message to the console
            if (message && message.message) {
              // Ensure message is not empty and has the message property
              console.log("Appending message:", message.message);
              if (firstMessageReceived.current) {
                setMessages((prevMessages) => {
                  const lastMessage = prevMessages[prevMessages.length - 1];
                  if (lastMessage && lastMessage.sender === "assistant") {
                    if (React.isValidElement(lastMessage.content)) {
                      lastMessage.content = message.message;
                    } else {
                      lastMessage.content += message.message;
                    }
                    return [...prevMessages.slice(0, -1), lastMessage];
                  }
                  return prevMessages;
                });
              } else {
                firstMessageReceived.current = true;
              }
            }
          });

          socketRef.current.on("message_done", () => {
            console.log("Message done");
            setIsAssistantResponding(false);
          });
        } else {
          console.error("Failed to fetch user email");
          localStorage.removeItem("token");
        }
      } catch (error) {
        console.error("Error fetching user email", error);
        localStorage.removeItem("token");
      }
    };

    fetchUserEmail();

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendMessage = () => {
    if (input.trim() !== "" && userEmail && socketRef.current) {
      const userMessage = { content: input, sender: "user" };
      console.log("Sending user message:", userMessage);
      setMessages((prevMessages) => [
        ...prevMessages,
        userMessage,
        { content: <LoadingDots />, sender: "assistant" }, // Add LoadingDots component here
      ]);
      setIsAssistantResponding(true);
      firstMessageReceived.current = false; // Reset for the next round of messages
      socketRef.current.emit("sow_chat", { prompt: input, user_id: userEmail });
      setInput("");
      inputRef.current.focus(); // Keep focus on the textarea
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !isAssistantResponding) {
      event.preventDefault(); // Prevent the default behavior of the Enter key
      sendMessage();
    }
  };

  const downloadFile = async (filename) => {
    const file_id = fileMappings[filename];
    if (!file_id) {
      console.error(`No file_id found for filename: ${filename}`);
      return;
    }
    console.log("Creating link for " + filename);
    console.log("Creating link for " + file_id);
    try {
      const response = await fetch(
        `${API_BASE_URL}/assistants/download_file`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file_id: file_id,
            filename: filename,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading the file:", error);
    }
  };

  const formatMessage = (message, downloadFile) => {
    // Split message into lines
    const lines = message.split("\n");
  
    return lines.map((line, index) => {
      // Check for header formatting
      const headerMatch = line.match(/^(#+)\s*(.*)$/);
      if (headerMatch) {
        const headerLevel = headerMatch[1].length; // Number of # characters
        const headerText = headerMatch[2]; // Text following the # characters
        const HeaderTag = `h${headerLevel}`; // Construct header tag (h1, h2, etc.)
        return <HeaderTag key={index}>{headerText}</HeaderTag>;
      }
  
      // Process inline formatting (bold, italic, inline code)
      const formattedLine = line.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={`${index}-${i}`}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={`${index}-${i}`}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={`${index}-${i}`}>{part.slice(1, -1)}</code>;
        }
        return part;
      });
  
      // Join formatted parts back into a single string for further processing
      const formattedLineString = formattedLine.reduce((acc, curr) => acc.concat(curr), '');
  
      // Check for download link formatting
      const downloadLinkMatch = line.match(/\[([^\]]+)\]\(sandbox:\/mnt\/data\/([^\)]+)\)/);
      if (downloadLinkMatch) {
        const linkText = downloadLinkMatch[1];
        const filename = downloadLinkMatch[2];
        console.log("Created filename link: " + filename);
        return (
          <a
            key={index}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              downloadFile(filename);
            }}
          >
            {linkText}
          </a>
        );
      }
  
      // Check for blockquote formatting
      const blockquoteMatch = line.match(/^>\s*(.*)$/);
      if (blockquoteMatch) {
        return <blockquote key={index}>{blockquoteMatch[1]}</blockquote>;
      }
  
      // Check for list formatting
      const listItemMatch = line.match(/^[-*]\s+(.*)$/);
      if (listItemMatch) {
        return <li key={index}>{formatMessage(listItemMatch[1])}</li>;
      }
  
      // Return formatted line with <br> for new lines
      return (
        <span key={index}>
          {formattedLine}
          <br />
        </span>
      );
    });
  };

  const formattedMessages = useMemo(() => {
    return messages.map((message, index) => (
      <div
        key={index}
        className={`message-box ${
          message.sender === "user" ? "user-message" : "assistant-message"
        }`}
      >
        {typeof message.content === "string"
          ? formatMessage(message.content, downloadFile)
          : message.content}
      </div>
    ));
  }, [messages, fileMappings]);

  return (
    <div className="chat-container">
      <Navbar />
      <div className="chat-window" ref={chatEndRef}>
        {formattedMessages}
        <div ref={chatEndRef} />
      </div>
      <div className="input-container">
        <textarea
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          ref={inputRef}
          rows="1"
        />
        <button onClick={sendMessage} disabled={isAssistantResponding}>
          Send
        </button>
      </div>
    </div>
  );
};

export default SowChatBot;