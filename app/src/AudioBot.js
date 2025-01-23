import "./AudioBot.css";
import React, { useEffect, useState, useRef } from "react";
import Navbar from "./components/Navbar";
import sendArrowIcon from "./components/images/send_arrow_icon.svg";
import microphoneIcon from "./components/images/microphone_icon.svg";
import { API_BASE_URL } from "./config";
import { v4 as uuidv4 } from "uuid"; // For generating unique event IDs

function AudioBot() {
  const [clientSecret, setClientSecret] = useState(null);
  const [messages, setMessages] = useState([]);
  const [eventLog, setEventLog] = useState([]);
  const [audioQueue, setAudioQueue] = useState([]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpacebarPressed, setIsSpacebarPressed] = useState(false);
  const [isMessageFinalized, setIsMessageFinalized] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const audioContext = useRef(null);
  const peerConnection = useRef(null);
  const dataChannel = useRef(null);
  const mediaRecorder = useRef(null);
  const audioStream = useRef(null);

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

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    dc.addEventListener("open", () => {
      console.log("Data channel is open and ready for communication.");
    });
    dc.addEventListener("message", (e) => {
      const realtimeEvent = JSON.parse(e.data);
      handleIncomingEvent(realtimeEvent);
    });
    dc.addEventListener("close", () => {
      console.log("Data channel is closed.");
    });

    peerConnection.current = pc;
    dataChannel.current = dc;

    try {
      // Start the session using the Session Description Protocol (SDP)
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

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);
      console.log("Remote description set with answer.");
    } catch (error) {
      console.error("Error during WebRTC initialization:", error);
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

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isTyping = document.activeElement.tagName === "INPUT";
      if (e.code === "Space" && !isSpacebarPressed && !isTyping) {
        setIsSpacebarPressed(true);
        startAudioRecording();
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === "Space" && isSpacebarPressed) {
        setIsSpacebarPressed(false);
        stopAudioRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isSpacebarPressed]);

  // Fetch session token and set up WebRTC connection
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/audiobot/session`);
        if (!response.ok) {
          throw new Error(`Error fetching session: ${response.status}`);
        }

        const data = await response.json();
        const token = data.client_secret?.value;
        setClientSecret(token);
        console.log("Client secret obtained:", token);

        // Initialize WebRTC connection after obtaining the client secret
        initializeWebRTC(token);
      } catch (error) {
        console.error("Failed to fetch session:", error);
      }
    };

    fetchSession();
  }, []);

  // Log event in the sidebar
  const logEvent = (event) => {
    setEventLog((prev) => [event.type, ...prev]);
  };

  // Update messages by item_id
  const updateMessagesByItemId = (itemId, text) => {
    setMessages((prev) => {
      const existingMessageIndex = prev.findIndex(
        (msg) => msg.item_id === itemId
      );
      if (existingMessageIndex !== -1) {
        const updatedMessages = [...prev];
        updatedMessages[existingMessageIndex].text += text;
        return updatedMessages;
      } else {
        return [...prev, { item_id: itemId, text, sender: "ai" }];
      }
    });
  };

  // Handle incoming WebRTC events
  const handleIncomingEvent = (event) => {
    console.log("Incoming event:", event);
    logEvent(event);

    switch (event.type) {
      case "response.text.delta":
        if (event.item_id) {
          updateMessagesByItemId(event.item_id, event.delta);
        }
        break;

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

      default:
        console.log("Unhandled event type:", event.type);
    }
  };

  const handleSendMessage = () => {
    if (!dataChannel.current) {
      console.error("Data channel is not initialized.");
      return;
    }

    // Wait until the data channel is open
    if (dataChannel.current.readyState === "connecting") {
      console.log("Data channel is still connecting. Retrying...");
      const interval = setInterval(() => {
        if (dataChannel.current.readyState === "open") {
          clearInterval(interval);

          // Send the conversation.item.create event
          const messageEvent = {
            event_id: uuidv4(),
            type: "conversation.item.create",
            item: {
              type: "message",
              object: "realtime.item",
              role: "user",
              content: [{ type: "input_text", text: inputValue }],
            },
          };
          dataChannel.current.send(JSON.stringify(messageEvent));
          console.log("Text message sent:", messageEvent);

          // Send the response.create event
          const responseEvent = {
            event_id: uuidv4(),
            type: "response.create",
          };
          dataChannel.current.send(JSON.stringify(responseEvent));
          console.log("Response.create event sent:", responseEvent);

          // Update the local state for messages
          setMessages((prev) => [
            ...prev,
            { sender: "user", text: inputValue },
          ]);
          setInputValue("");
        }
      }, 100); // Check every 100ms
      return;
    }

    // If already open, send the events immediately
    const messageEvent = {
      event_id: uuidv4(),
      type: "conversation.item.create",
      item: {
        type: "message",
        object: "realtime.item",
        role: "user",
        content: [{ type: "input_text", text: inputValue }],
      },
    };
    dataChannel.current.send(JSON.stringify(messageEvent));
    console.log("Text message sent:", messageEvent);

    const responseEvent = {
      event_id: uuidv4(),
      type: "response.create",
    };
    dataChannel.current.send(JSON.stringify(responseEvent));
    console.log("Response.create event sent:", responseEvent);

    setMessages((prev) => [...prev, { sender: "user", text: inputValue }]);
    setInputValue("");
  };

  // Handle text delta events (streaming text)
  const handleTextDelta = (event) => {
    if (isMessageFinalized) {
      // Start a new message
      setMessages((prev) => [...prev, { sender: "ai", text: event.delta }]);
      setIsMessageFinalized(false);
    } else {
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && lastMessage.sender === "ai") {
          lastMessage.text += event.delta;
          return [...prev.slice(0, -1), lastMessage];
        }
        return [...prev, { sender: "ai", text: event.delta }];
      });
    }
  };

  // Finalize text message
  const finalizeTextMessage = (event) => {
    console.log("Text finalized:", event.text);
    setIsMessageFinalized(true);
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
    console.log("Audio playback finalized.");
    // Allow the remaining chunks to finish playing
    if (audioQueue.length === 0) {
      setIsPlayingAudio(false);
    }
  };

  // Handle transcript delta (streaming transcription)
  const handleTranscriptDelta = (event) => {
    console.log("Transcript delta:", event.delta);
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.sender === "ai") {
        lastMessage.text += event.delta;
        return [...prev.slice(0, -1), lastMessage];
      }
      return [...prev, { sender: "ai", text: event.delta }];
    });
  };

  // Finalize transcription
  const finalizeTranscript = (event) => {
    console.log("Final transcript:", event.transcript);
    setIsMessageFinalized(true);
  };

  // Send audio chunks to the server
  const sendAudioChunk = (audioData) => {
    if (dataChannel.current && dataChannel.current.readyState === "open") {
      const event = {
        event_id: uuidv4(),
        type: "input_audio_buffer.append",
        audio: btoa(String.fromCharCode(...new Uint8Array(audioData))), // Base64-encode the audio
      };
      dataChannel.current.send(JSON.stringify(event));
      console.log("Audio chunk sent:", event);
    }
  };

  // Fetch session token and set up WebRTC connection
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/audiobot/session`);
        if (!response.ok) {
          throw new Error(`Error fetching session: ${response.status}`);
        }

        const data = await response.json();
        setClientSecret(data.client_secret?.value);
        console.log("Client secret obtained:", data.client_secret?.value);

        // Initialize WebRTC connection after obtaining the client secret
        initializeWebRTC();
      } catch (error) {
        console.error("Failed to fetch session:", error);
      }
    };

    fetchSession();
  }, []);

  return (
    <>
      <Navbar />
      <div className="audio-bot-container">
        {/* Sidebar */}
        <div className="left-sidebar">
          <h2>Event Log</h2>
          <ul className="event-log">
            {eventLog.map((event, index) => (
              <li key={eventLog.length - index - 1}>{event}</li>
            ))}
          </ul>
        </div>

        {/* Main Content */}
        <div className="main-content">
          {/* Messages */}
          <div className="messages">
            {messages.map((msg, index) => (
              <p
                key={index}
                className={`message ${
                  msg.sender === "user" ? "user-message" : "ai-message"
                }`}
              >
                {msg.text}
              </p>
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
                  console.log("message sent");
                }
              }}
            />
            <button
              className="send-button"
              onClick={() => {
                handleSendMessage();
                setMessages((prev) => [
                  ...prev,
                  { sender: "user", text: inputValue },
                ]);
              }}
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
