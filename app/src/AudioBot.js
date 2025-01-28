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
  const [isDataChannelOpen, setIsDataChannelOpen] = useState(false);
  const audioContext = useRef(null);
  const peerConnection = useRef(null);
  const [dataChannel, setDataChannel] = useState(null);
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

    const dc = pc.createDataChannel("oai-events");
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

  useEffect(() => {
    if (!dataChannel) return;

    const handleMessage = (e) => {
      const realtimeEvent = JSON.parse(e.data);
      handleIncomingEvent(realtimeEvent);
    };
    const handleClose = () => {
      console.log("Data channel is closed.");
      setDataChannel(null);
    };

    // dataChannel.addEventListener("message", handleMessage);
    // dataChannel.addEventListener("close", handleClose);

    // return () => {
    //   dataChannel.removeEventListener("message", handleMessage);
    //   dataChannel.removeEventListener("close", handleClose);
    // };
  }, [dataChannel]);

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
    // Suppose the server’s event structure has `item_id`, `previous_item_id`, `transcript`, etc.
    const { item_id, transcript, role, previous_item_id } = event;

    if (!item_id) {
      console.warn("No item_id found in user transcript event:", event);
      return;
    }

    // Often we know it's "user", but if the event includes a role, you can use that:
    insertOrUpdateMessage({
      item_id,
      role: role || "user",
      text: transcript || "",
      previous_item_id,
    });
  }

  // Handle incoming WebRTC events
  const handleIncomingEvent = (event) => {
    console.log("Incoming event:", event);
    logEvent(event);

    switch (event.type) {
      case "response.text.delta": {
        if (!event.item_id) return;
        // We'll do an "append" version:
        const delta = event.delta;
        appendMessageText(event.item_id, delta);
        break;
      }

      case "conversation.item.created": {
        // "previous_item_id" and "item" are inside event
        const { previous_item_id, item } = event;

        // item.id is the new "msg_003", etc.
        // item.role is "user" or "assistant"
        // item.content is an array. You can parse out text/transcript from it.
        let initialText = "";
        if (item.content && item.content.length > 0) {
          // For example, if content[0].type === 'input_audio', read its transcript
          // If content[0].type === 'input_text', read content[0].text
          const c0 = item.content[0];
          // You can unify them or do if/else. For example:
          initialText = c0.transcript || c0.text || "";
        }

        insertOrUpdateMessage({
          item_id: item.id,
          role: item.role, // 'user', 'assistant', etc.
          text: initialText,
          previous_item_id, // might be null
        });
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

      default:
        console.log("Unhandled event type:", event.type);
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
    // We'll always call this inside setMessages to produce the new state.
    setMessages((prev) => {
      // 1. Check if message with this item_id already exists
      const existingIndex = prev.findIndex((m) => m.item_id === item_id);

      if (existingIndex !== -1) {
        // === UPDATE existing message ===
        const updatedMessages = [...prev];
        const existingMsg = updatedMessages[existingIndex];

        // For text, we can either REPLACE or APPEND. Usually for transcripts,
        // we might replace. For text "delta" from the assistant, we might append.
        // This example just replaces for transcripts; you can adapt as needed.
        updatedMessages[existingIndex] = {
          ...existingMsg,
          role: role ?? existingMsg.role,
          text: text !== undefined ? text : existingMsg.text,
        };
        return updatedMessages;
      }

      // === INSERT new message ===
      const newMsg = {
        item_id,
        role,
        text: text || "",
      };

      // If no previous_item_id, place at the front (index=0)
      if (!previous_item_id) {
        return [newMsg, ...prev];
      }

      // Otherwise find the item with item_id === previous_item_id
      const insertAfterIndex = prev.findIndex(
        (m) => m.item_id === previous_item_id
      );

      // If we can’t find that item, fallback to appending at the end
      if (insertAfterIndex === -1) {
        return [...prev, newMsg];
      }

      // Otherwise insert after that item
      const newArray = [...prev];
      newArray.splice(insertAfterIndex + 1, 0, newMsg);
      return newArray;
    });
  }

  function handleConversationItemCreated(event) {
    const { previous_item_id, item } = event;
    const newItemId = item.id; // e.g. "msg_003"
    // Grab existing text from content if you want:
    let initialText = "";
    if (item.content && item.content.length > 0) {
      const firstChunk = item.content[0];
      // e.g. from input_text, transcript, or both
      initialText = firstChunk.text || firstChunk.transcript || "";
    }

    const newMessage = {
      item_id: newItemId,
      role: item.role,
      text: initialText,
    };

    setMessages((prev) => {
      // If message already exists, skip or update
      const existingIndex = prev.findIndex((m) => m.item_id === newItemId);
      if (existingIndex !== -1) {
        // Possibly merge text if you want
        return prev;
      }

      // Insert at correct spot
      if (!previous_item_id) {
        // No previous => put at front
        return [newMessage, ...prev];
      }

      const insertAfterIndex = prev.findIndex(
        (m) => m.item_id === previous_item_id
      );

      // If we can't find the reference item, fallback to end
      if (insertAfterIndex === -1) {
        return [...prev, newMessage];
      }

      const newArray = [...prev];
      newArray.splice(insertAfterIndex + 1, 0, newMessage);
      return newArray;
    });
  }

  const sendClientEvent = (message) => {
    if (!isDataChannelOpen) {
      console.error("Data channel is not open.");
      return;
    }
    dataChannel.send(JSON.stringify(message));
    console.log("Message sent:", message);
  };

  const handleSendMessage = () => {
    const messageEvent = {
      event_id: uuidv4(),
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: inputValue }],
      },
    };
    sendClientEvent(messageEvent);

    const responseEvent = {
      event_id: uuidv4(),
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
    console.log("Audio playback finalized.");
    // Allow the remaining chunks to finish playing
    if (audioQueue.length === 0) {
      setIsPlayingAudio(false);
    }
  };

  // Finalize transcription
  const finalizeTranscript = (event) => {
    console.log("Final transcript:", event.transcript);
    setIsMessageFinalized(true);
  };

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
                  msg.role === "user" ? "user-message" : "ai-message"
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
            <button className="send-button" onClick={handleSendMessage}>
              <img src={sendArrowIcon} alt="Send" className="icon" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default AudioBot;
