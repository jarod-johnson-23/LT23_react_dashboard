import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import './SowChatBot.css';
import Navbar from './components/Navbar';
import { API_BASE_URL } from './config';

const SowChatBot = () => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [userEmail, setUserEmail] = useState(null);
    const [isAssistantResponding, setIsAssistantResponding] = useState(false);
    const socketRef = useRef(null);
    const firstMessageReceived = useRef(false);

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
                        transports: ['websocket', 'polling'],  // Ensure WebSocket is supported
                        query: { user_id: data.logged_in_as }
                    });

                    // Safeguard to ensure event listeners are not duplicated
                    socketRef.current.off('connected');
                    socketRef.current.off('new_message');
                    socketRef.current.off('message_done');

                    socketRef.current.on('connected', (data) => {
                        console.log('Connected:', data);
                    });

                    socketRef.current.on('new_message', (message) => {
                        console.log('Received message:', message);  // Log the message to the console
                        if (message && message.message) {  // Ensure message is not empty and has the message property
                            console.log('Appending message:', message.message);
                            if (firstMessageReceived.current) {
                                setMessages((prevMessages) => {
                                    const lastMessage = prevMessages[prevMessages.length - 1];
                                    if (lastMessage && lastMessage.sender === 'assistant') {
                                        lastMessage.content += message.message;
                                        return [...prevMessages.slice(0, -1), lastMessage];
                                    }
                                    return prevMessages;
                                });
                            } else {
                                firstMessageReceived.current = true;
                            }
                        }
                    });

                    socketRef.current.on('message_done', () => {
                        console.log('Message done');
                        setIsAssistantResponding(false);
                    });

                } else {
                    console.error('Failed to fetch user email');
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

    const sendMessage = () => {
        if (input.trim() !== '' && userEmail && socketRef.current) {
            const userMessage = { content: input, sender: 'user' };
            console.log('Sending user message:', userMessage);
            setMessages((prevMessages) => [...prevMessages, userMessage, { content: '', sender: 'assistant' }]);
            setIsAssistantResponding(true);
            firstMessageReceived.current = false;  // Reset for the next round of messages
            socketRef.current.emit('sow_chat', { prompt: input, user_id: userEmail });
            setInput('');
        }
    };

    const formatMessage = (message) => {
        // Replace **text** with <strong>text</strong> and newline characters with <br> elements
        const formattedMessage = message.split('\n').map((item, index) => (
            <span key={index}>
                {item.split(/(\*\*.*?\*\*)/g).map((part, i) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={i}>{part.slice(2, -2)}</strong>;
                    }
                    return part;
                })}
                <br />
            </span>
        ));
        return formattedMessage;
    };

    return (
        <div className="chat-container">
            <Navbar />
            <div className="chat-window">
                {messages.map((message, index) => (
                    <div
                        key={index}
                        className={`message-box ${message.sender === 'user' ? 'user-message' : 'assistant-message'}`}
                    >
                        {formatMessage(message.content)}
                    </div>
                ))}
            </div>
            <div className="input-container">
                <input 
                    type="text" 
                    value={input} 
                    onChange={(e) => setInput(e.target.value)} 
                    placeholder="Type your message..." 
                    disabled={!userEmail || isAssistantResponding}  // Disable input until user email is fetched or while assistant is responding
                />
                <button onClick={sendMessage} disabled={!userEmail || isAssistantResponding}>Send</button>
            </div>
        </div>
    );
};

export default SowChatBot;