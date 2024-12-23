import styles from './styles.module.css';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const RoomAndUsers = ({ socket, username, room }) => {
    const [roomUsers, setRoomUsers] = useState([]);

    const navigate = useNavigate();

    useEffect(() => {
        socket.on('chatroom_users', (data) => {
            console.log('Received updated user list:', data);
            setRoomUsers(data);
        });

        return () => socket.off('chatroom_users');
    }, [socket]);

    const leaveRoom = () => {
        console.log(`${username} is leaving room: ${room}`);
        socket.emit('leave_room', { username, room });
        // Redirect to home page
        navigate('/', { replace: true });
    };

    return (
        <div className={styles.roomAndUsersColumn}>
            <h2 className={styles.roomTitle}>{room}</h2>

            <div>
                {roomUsers.length > 0 && <h5 className={styles.usersTitle}>Users:</h5>}
                <ul className={styles.usersList}>
                    {roomUsers.map((user) => (
                        <li
                            style={{
                                fontWeight: `${user.username === username ? 'bold' : 'normal'}`,
                            }}
                            key={user.socketId}
                        >
                            {user.username}
                        </li>
                    ))}
                </ul>
            </div>

            <button className='btn btn-outline' onClick={leaveRoom}>
                Leave
            </button>
        </div>
    );
};

export default RoomAndUsers;