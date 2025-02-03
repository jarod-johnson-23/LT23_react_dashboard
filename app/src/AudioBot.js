import "./AudioBot.css";
import React, { useEffect, useState, useRef } from "react";
import Navbar from "./components/Navbar";
import sendArrowIcon from "./components/images/send_arrow_icon.svg";
import microphoneIcon from "./components/images/microphone_icon.svg";
import microphoneSlashIcon from "./components/images/microphone_slash_icon.svg";
import { API_BASE_URL } from "./config";
// import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import CustomDropdown from "./components/CustomDropdown";

function AudioBot() {
  const [clientSecret, setClientSecret] = useState(null);
  const [messages, setMessages] = useState([]); // Current session messages
  const [oldMessages, setOldMessages] = useState([]); // Previous session messages
  const [audioQueue, setAudioQueue] = useState([]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpacebarPressed, setIsSpacebarPressed] = useState(false);
  const [isMessageFinalized, setIsMessageFinalized] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isDataChannelOpen, setIsDataChannelOpen] = useState(false);
  const [isSessionStarted, setIsSessionStarted] = useState(false); // Track session state
  const audioContext = useRef(null);
  const peerConnection = useRef(null);
  const [dataChannel, setDataChannel] = useState(null);
  const audioStream = useRef(null);
  const [instructions, setInstructions] = useState(""); // User input for instructions
  const [voice, setVoice] = useState(""); // Default voice selection
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // Show spinner while waiting
  const messagesContainerRef = useRef(null);
  const dataChannelRef = useRef(null);

  const initializeWebRTC = async (token) => {
    const pc = new RTCPeerConnection();

    // Set up to play remote audio from the model
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    pc.ontrack = (e) => {
      audioEl.srcObject = e.streams[0];
    };

    // Add local audio track for microphone input in the browser
    if (!audioStream.current) {
      audioStream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const audioTrack = audioStream.current.getAudioTracks()[0];

      // Ensure microphone starts muted
      audioTrack.enabled = false;
      console.log("Microphone is muted on initialization");
    }

    pc.addTrack(audioStream.current.getTracks()[0]);

    const dc = pc.createDataChannel("oai-events");
    dataChannelRef.current = dc; // Store it in a ref
    peerConnection.current = pc; // Set peer connection reference early
    setDataChannel(dc); // Trigger state change for useEffect
    dc.addEventListener("open", () => {
      console.log("Data channel is open and ready for communication.");
      setIsDataChannelOpen(true);
    });
    dc.addEventListener("message", (e) => {
      const realtimeEvent = JSON.parse(e.data);
      handleIncomingEvent(realtimeEvent);
    });
    dc.addEventListener("close", () => {
      console.log("Data channel is closed.");
      setIsDataChannelOpen(false);
      dataChannelRef.current = null; // Clear it when closed
    });

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview-2024-12-17";
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        throw new Error(`SDP response failed: ${sdpResponse.status}`);
      }

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);
      console.log("SDP exchange completed successfully.");
    } catch (error) {
      console.error("Error during SDP exchange:", error);
    }
  };

  const MAX_RETRIES = 3;

  const startSession = async (retryCount = 0) => {
    try {
      setIsLoading(true);
      setIsSessionReady(false);

      // Cleanup any previous session if needed
      cleanupWebRTC();

      // Move user and assistant messages to oldMessages
      if (messages.length > 0) {
        setOldMessages((prev) => [
          ...messages.map((msg) => ({
            ...msg,
            isOld: true,
          })),
          ...prev,
        ]);
      }

      // Insert a system message indicating the settings change
      setMessages([
        {
          role: "system",
          text: "Assistant settings changed.",
          timestamp: Date.now(),
        },
      ]);

      const response = await fetch(`${API_BASE_URL}/audiobot/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions, voice }),
      });

      // If the server returns a 500 error, throw an error to trigger a retry.
      if (response.status === 500) {
        throw new Error("500");
      }

      if (!response.ok) {
        throw new Error(`Session creation failed: ${response.status}`);
      }

      const data = await response.json();
      const token = data.client_secret?.value;
      setClientSecret(token);
      console.log("Session started. Token:", token);

      // Initialize WebRTC for the new session.
      initializeWebRTC(token);
      setIsSessionStarted(true);
    } catch (error) {
      // Check if the error was a 500 error and we haven't exceeded our max retries.
      if (error.message === "500" && retryCount < MAX_RETRIES) {
        console.error(
          `Attempt ${retryCount + 1} failed with 500. Retrying in 1 second...`
        );
        setTimeout(() => {
          startSession(retryCount + 1);
        }, 1000);
      } else {
        console.error("Failed to start session:", error);
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            text: "An error occurred while starting the session.",
            timestamp: Date.now(),
          },
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const startAudioRecording = () => {
    if (peerConnection.current && audioStream.current) {
      const audioTrack = audioStream.current.getAudioTracks()[0];

      // Find existing sender for the track or add it
      let sender = peerConnection.current
        .getSenders()
        .find((s) => s.track === audioTrack);

      if (!sender) {
        sender = peerConnection.current.addTrack(
          audioTrack,
          audioStream.current
        );
        console.log("Audio track added to peer connection");
      }

      // Enable the track
      audioTrack.enabled = true;
      console.log("Microphone unmuted");
    }
    setIsRecording(true);
  };

  const stopAudioRecording = () => {
    if (peerConnection.current && audioStream.current) {
      const audioTrack = audioStream.current.getAudioTracks()[0];

      // Find the sender for the track
      const sender = peerConnection.current
        .getSenders()
        .find((s) => s.track === audioTrack);

      if (sender) {
        // Disable the track without removing it
        audioTrack.enabled = false;
        console.log("Microphone muted");
      }
    }
    setIsRecording(false);
  };

  const cleanupWebRTC = () => {
    // Close and null out the data channel if it exists.
    if (dataChannel) {
      dataChannel.close();
      setDataChannel(null);
    }

    // If there's an active peer connection, close it.
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    // Optionally stop any active audio tracks from the stream.
    if (audioStream.current) {
      audioStream.current.getTracks().forEach((track) => track.stop());
      audioStream.current = null;
    }

    // Clear out any audio processing state.
    setAudioQueue([]);
    if (audioContext.current) {
      audioContext.current.close();
      audioContext.current = null;
    }
  };

  const toggleAudioRecording = () => {
    if (isRecording) {
      stopAudioRecording();
    } else {
      startAudioRecording();
    }
  };

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages, oldMessages]);

  // Update messages by item_id
  const updateMessagesByItemId = (itemId, text) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.item_id === itemId);
      if (idx === -1) {
        // If the message doesn't exist yet, you could ignore or store partial
        return prev;
      }

      const updated = [...prev];
      const existing = updated[idx];

      updated[idx] = {
        ...existing,
        text: existing.text + text, // append the delta
      };

      return updated;
    });
  };

  function handleUserTranscript(event) {
    const { item_id, transcript, role, previous_item_id } = event;

    if (!item_id) {
      console.warn("No item_id found in user transcript event:", event);
      return;
    }

    // If transcript is empty or only whitespace, substitute with italicized text.
    const textToInsert =
      transcript && transcript.trim() !== "" ? transcript : "*Inaudible Text*";

    insertOrUpdateMessage({
      item_id,
      role: role || "user",
      text: textToInsert,
      previous_item_id,
    });
  }

  // Handle incoming WebRTC events
  const handleIncomingEvent = (event) => {
    switch (event.type) {
      case "session.created": {
        console.log("Session is fully active.");
        setIsSessionReady(true); // Remove overlay
        setIsLoading(false); // Hide spinner
        break;
      }

      case "response.text.delta": {
        if (!event.item_id) return;
        // We'll do an "append" version:
        const delta = event.delta;
        appendMessageText(event.item_id, delta);
        break;
      }

      case "conversation.item.created": {
        // Destructure previous_item_id and item from the event.
        const { previous_item_id, item } = event;

        // Check if this is a function call event.
        if (item.type === "function_call") {
          // Insert a message with role "function" and a placeholder text.
          insertOrUpdateMessage({
            item_id: item.id,
            role: "function",
            text: "Retrieving Function Results...",
            previous_item_id,
          });
        } else if (item.type === "function_call_output") {
          // Instead of inserting a new message, update the existing function call message.
          // We search for the message with role "function" that has the placeholder text.
          setMessages((prev) => {
            const index = prev.findIndex(
              (msg) =>
                msg.role === "function" &&
                msg.text === "Retrieving Function Results..."
            );
            if (index !== -1) {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                text: "Function call successful",
              };
              return updated;
            } else {
              // Fallback: if not found, insert a new message with the success text.
              return [
                ...prev,
                {
                  item_id: item.id,
                  role: "function",
                  text: "Function call successful",
                  timestamp: Date.now(),
                },
              ];
            }
          });
        } else {
          // Normal processing for other types of items.
          let initialText = "";
          if (item.content && item.content.length > 0) {
            const c0 = item.content[0];
            initialText = c0.transcript || c0.text || "";
          }
          insertOrUpdateMessage({
            item_id: item.id,
            role: item.role, // "user", "assistant", etc.
            text: initialText,
            previous_item_id,
          });
        }
        break;
      }

      case "response.text.done":
        if (event.item_id) {
          updateMessagesByItemId(event.item_id, "\n");
        }
        break;

      case "response.audio.delta":
        handleAudioDelta(event);
        break;

      case "response.audio.done":
        finalizeAudioPlayback();
        break;

      case "response.audio_transcript.delta":
        if (event.item_id) {
          updateMessagesByItemId(event.item_id, event.delta);
        }
        break;

      case "response.audio_transcript.done":
        finalizeTranscript(event);
        break;

      case "conversation.item.input_audio_transcription.completed":
        handleUserTranscript(event);
        break;

      case "response.function_call_arguments.done":
        searchFunction(event);
        break;

      default:
      // console.log("Unhandled event type:", event.type);
    }
  };

  const searchFunction = async (event) => {
    try {
      const query = event.arguments;
      const response = await fetch(
        `${API_BASE_URL}/audiobot/search_sections?query=${query}`
      );

      if (!response.ok) {
        throw new Error(`Error fetching session: ${response.status}`);
      }
      const data = await response.json();

      const functionResponse = {
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: `${event.call_id}`,
          output: JSON.stringify(data, null, 2),
          // output: "Function call success, this is a test, please let the user know the call was successful"
        },
      };

      sendClientEvent(functionResponse);

      const responseEvent = {
        type: "response.create",
      };
      sendClientEvent(responseEvent);
    } catch (error) {
      console.error("Failed to search term:", error);
      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: `${event.call_id}`,
          output: "AN ERROR OCCURED, UNABLE TO SEARCH",
        },
      });

      const responseEvent = {
        type: "response.create",
      };
      sendClientEvent(responseEvent);
    }
  };

  function appendMessageText(item_id, textDelta) {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.item_id === item_id);
      if (idx === -1) {
        // If we truly never created the item, fallback to insertOrUpdate
        return prev;
      }

      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        text: (updated[idx].text || "") + textDelta,
      };
      return updated;
    });
  }

  function insertOrUpdateMessage({ item_id, role, text, previous_item_id }) {
    // Always assign a timestamp when a message is created
    const newMessage = {
      item_id,
      role,
      text: text || "",
      timestamp: Date.now(), // assign the creation time
    };

    setMessages((prev) => {
      // 1. Check if message with this item_id already exists
      const existingIndex = prev.findIndex((m) => m.item_id === item_id);

      if (existingIndex !== -1) {
        // Update existing message without changing its timestamp
        const updatedMessages = [...prev];
        const existingMsg = updatedMessages[existingIndex];
        updatedMessages[existingIndex] = {
          ...existingMsg,
          role: role ?? existingMsg.role,
          text: text !== undefined ? text : existingMsg.text,
        };
        return updatedMessages;
      }

      // 2. Insert new message.
      if (!previous_item_id) {
        // No previous => put at the beginning (if that’s your intended order)
        return [newMessage, ...prev];
      }

      // Otherwise, find the reference item and insert after it.
      const insertAfterIndex = prev.findIndex(
        (m) => m.item_id === previous_item_id
      );

      if (insertAfterIndex === -1) {
        // If reference not found, append at the end
        return [...prev, newMessage];
      }

      const newArray = [...prev];
      newArray.splice(insertAfterIndex + 1, 0, newMessage);
      return newArray;
    });
  }

  const sendClientEvent = (message) => {
    if (
      !dataChannelRef.current ||
      dataChannelRef.current.readyState !== "open"
    ) {
      console.error(
        "Data channel is not open (readyState:",
        dataChannelRef.current ? dataChannelRef.current.readyState : "null",
        ")."
      );
      return;
    }

    dataChannelRef.current.send(JSON.stringify(message));
  };

  const handleSendMessage = () => {
    const messageEvent = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: inputValue }],
      },
    };
    sendClientEvent(messageEvent);

    const responseEvent = {
      type: "response.create",
    };
    sendClientEvent(responseEvent);

    // setMessages((prev) => [...prev, { role: "user", text: inputValue }]);
    setInputValue("");
  };

  // Handle audio delta (chunked audio)
  const handleAudioDelta = (event) => {
    const audioChunk = Uint8Array.from(atob(event.delta), (c) =>
      c.charCodeAt(0)
    );
    setAudioQueue((prev) => [...prev, audioChunk]);

    if (!isPlayingAudio) {
      playAudioChunks();
    }
  };

  // Play queued audio chunks
  const playAudioChunks = () => {
    if (audioQueue.length === 0) {
      setIsPlayingAudio(false);
      return;
    }

    setIsPlayingAudio(true);

    if (!audioContext.current) {
      audioContext.current = new AudioContext();
    }

    const chunk = audioQueue.shift();
    setAudioQueue(audioQueue);

    audioContext.current.decodeAudioData(chunk.buffer, (buffer) => {
      const source = audioContext.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.current.destination);
      source.onended = playAudioChunks; // Play next chunk when finished
      source.start();
    });
  };

  // Finalize audio playback
  const finalizeAudioPlayback = () => {
    // Allow the remaining chunks to finish playing
    if (audioQueue.length === 0) {
      setIsPlayingAudio(false);
    }
  };

  // Finalize transcription
  const finalizeTranscript = (event) => {
    setIsMessageFinalized(true);
  };

  return (
    <>
      <Navbar />
      <div className="audio-bot-container">
        {/* Sidebar Configuration */}
        <div className="session-config">
          <textarea
            placeholder="Enter assistant instructions..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="instruction-input"
          />
          <CustomDropdown selectedValue={voice} onChange={setVoice} />
          <button className="apply-button" onClick={startSession}>
            Apply
          </button>
        </div>

        {/* Main Content */}
        <div className="main-content">
          {/* Overlay that blocks user interactions until session starts */}
          {(!isSessionStarted || !isSessionReady) && (
            <div className="overlay">
              {isLoading ? (
                <div className="spinner"></div>
              ) : (
                "Waiting for Chatbot to Connect..."
              )}
            </div>
          )}

          <div className="messages" ref={messagesContainerRef}>
            {[...oldMessages, ...messages]
              .sort((a, b) => a.timestamp - b.timestamp)
              .map((msg, index) => (
                <div
                  key={`msg-${index}`}
                  className={`message ${msg.role}-message ${
                    msg.isOld ? "old-message" : ""
                  }`}
                >
                  {msg.role === "system" ? (
                    <div className="system-message">{msg.text}</div>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  )}
                </div>
              ))}
          </div>

          {/* Input Section */}
          <div className="input-section">
            <input
              type="text"
              placeholder="Type your message..."
              className="message-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSendMessage();
                }
              }}
              disabled={!isSessionStarted}
            />
            <button
              className={`mic-button ${
                isRecording ? "active" : ""
              }`}
              onClick={toggleAudioRecording}
              disabled={!isSessionStarted}
            >
              <img
                src={isRecording ? microphoneIcon : microphoneSlashIcon}
                alt="Mic"
                className="icon"
              />
            </button>
            <button
              className="send-button"
              onClick={handleSendMessage}
              disabled={!isSessionStarted}
            >
              <img src={sendArrowIcon} alt="Send" className="icon" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default AudioBot;
