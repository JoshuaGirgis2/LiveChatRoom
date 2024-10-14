import styles from './styles.module.css';
import { useState, useEffect, useRef } from 'react';

const Messages = ({ socket, username, room }) => {
    const [messagesReceived, setMessagesReceived] = useState(() => {
        // Load saved messages from localStorage when the component mounts
        const savedMessages = localStorage.getItem(`messages_${room}`);
        return savedMessages ? JSON.parse(savedMessages) : [];
    });
    const [message, setMessage] = useState('');
    const lastMessageRef = useRef(null);
    const joinedRef = useRef(false);
    const fetchedMessagesRef = useRef(false);

    useEffect(() => {
        const handleMessage = (data) => {
            console.log('Received message:', data);

            setMessagesReceived((prevState) => {
                // Check if the message already exists in the state
                const messageExists = prevState.some(
                    (msg) =>
                        msg.username === data.username &&
                        msg.message === data.message &&
                        msg.__createdtime__ === data.__createdtime__
                );

                if (!messageExists) {
                    const updatedMessages = [...prevState, data];

                    // Save updated messages to localStorage
                    localStorage.setItem(`messages_${room}`, JSON.stringify(updatedMessages));

                    return updatedMessages;
                }
                return prevState;
            });
        };

        // Join the room only once
        if (!joinedRef.current) {
            console.log(`Emitting join_room for ${username} in room ${room}`);
            socket.emit('join_room', { username, room });
            joinedRef.current = true;
        }

        // Handle incoming messages
        socket.on('receive_message', handleMessage);

        // Fetch last 100 messages only once
        if (!fetchedMessagesRef.current) {
            socket.once('last_100_messages', (last100Messages) => {
                console.log('Last 100 messages:', JSON.parse(last100Messages));

                const sortedMessages = JSON.parse(last100Messages).sort(
                    (a, b) => new Date(a.timestamp || a.__createdtime__) - new Date(b.timestamp || b.__createdtime__)
                );

                setMessagesReceived(sortedMessages);
                fetchedMessagesRef.current = true;

                // Save fetched messages to localStorage
                localStorage.setItem(`messages_${room}`, JSON.stringify(sortedMessages));
            });
        }

        return () => {
            socket.off('receive_message', handleMessage);
            if (joinedRef.current) {
                console.log(`Emitting leave_room for ${username} from room ${room}`);
                socket.emit('leave_room', { username, room });
                joinedRef.current = false;
            }
        };
    }, [socket, username, room]);

    useEffect(() => {
        lastMessageRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messagesReceived]);

    const sendMessage = () => {
        if (message !== '') {
            console.log('Sending message:', message);
            socket.emit('send_message', { message, username, room });
            setMessage('');
        }
    };

    function formatDateFromTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString();
    }

    const sortedMessages = messagesReceived.sort(
        (a, b) => new Date(a.timestamp || a.__createdtime__) - new Date(b.timestamp || b.__createdtime__)
    );

    return (
        <div className={styles.messagesColumn}>
            {sortedMessages.map((msg, i) => (
                <div className={styles.message} key={i} ref={i === sortedMessages.length - 1 ? lastMessageRef : null}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className={styles.msgMeta}>{msg.username}</span>
                        <span className={styles.msgMeta}>
                            {formatDateFromTimestamp(msg.timestamp || msg.__createdtime__)}
                        </span>
                    </div>
                    <p className={styles.msgText}>{msg.message}</p>
                    <br />
                </div>
            ))}

            <div className={styles.inputContainer}>
                <input
                    type="text"
                    className={styles.messageInput}
                    placeholder=" message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button className={styles.sendButton} onClick={sendMessage}>
                    Send Message
                </button>
            </div>
        </div>
    );
};

export default Messages;
