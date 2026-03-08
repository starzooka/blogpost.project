import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { WS_BASE_URL } from '../api';

const RECONNECT_DELAY_MS = 2500;
const HISTORY_POLL_MS = 8000;
const ONLINE_POLL_MS = 10000;
const TYPING_STOP_DELAY_MS = 1200;

function Chat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [onlineUserIds, setOnlineUserIds] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [socketState, setSocketState] = useState('connecting');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [typingByUserId, setTypingByUserId] = useState(null);
  const [readReceiptText, setReadReceiptText] = useState('');

  const socketRef = useRef(null);
  const selectedUserRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);

  const token = localStorage.getItem('access_token');
  const myId = Number(localStorage.getItem('user_id') || 0);
  const requestedUserId = Number(searchParams.get('user') || 0);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    if (!token) return;
    const fetchUsers = async () => {
      try {
        const response = await api.get('/users/all');
        setUsers(response.data);
      } catch {
        setError('Unable to load contacts. Please refresh.');
      }
    };
    fetchUsers();
  }, [token]);

  useEffect(() => {
    if (!requestedUserId || users.length === 0) return;
    const targetUser = users.find((user) => user.id === requestedUserId);
    if (!targetUser) return;
    setSelectedUser((prev) => (prev?.id === targetUser.id ? prev : targetUser));
  }, [requestedUserId, users]);

  useEffect(() => {
    if (!token || !Number.isInteger(myId) || myId <= 0) {
      setSocketState('offline');
      return undefined;
    }

    let reconnectTimer;
    let manuallyClosed = false;

    const connectSocket = () => {
      setSocketState('connecting');
      const wsUrl = `${WS_BASE_URL}/ws/chat/${myId}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setSocketState('connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const active = selectedUserRef.current;

          if (data.type === 'typing') {
            if (active && data.sender_id === active.id && data.receiver_id === myId) {
              setTypingByUserId(data.is_typing ? data.sender_id : null);
            }
            return;
          }

          if (data.type === 'read') {
            if (active && data.sender_id === active.id && data.receiver_id === myId) {
              setMessages((prev) => prev.map((msg) => (
                msg.sender_id === myId && msg.receiver_id === active.id ? { ...msg, is_read: true } : msg
              )));
              setReadReceiptText(`Seen ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
            }
            return;
          }

          if (data.type !== 'message') return;
          if (!active) return;

          const belongsToOpenConversation =
            (data.sender_id === active.id && data.receiver_id === myId) ||
            (data.sender_id === myId && data.receiver_id === active.id);
          if (!belongsToOpenConversation) return;

          setMessages((prev) => {
            if (data.id && prev.some((msg) => msg.id === data.id)) return prev;
            return [...prev, data];
          });
        } catch {
          // Ignore malformed payloads.
        }
      };

      ws.onerror = () => {
        setSocketState('offline');
      };

      ws.onclose = () => {
        if (manuallyClosed) return;
        setSocketState('offline');
        reconnectTimer = setTimeout(connectSocket, RECONNECT_DELAY_MS);
      };
    };

    connectSocket();

    return () => {
      manuallyClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) {
        socketRef.current.close();
      }
    };
  }, [myId, token]);

  useEffect(() => {
    if (!token) return undefined;

    let mounted = true;
    const fetchOnlineUsers = async () => {
      try {
        const response = await api.get('/users/online');
        if (mounted) {
          setOnlineUserIds(response.data?.online_user_ids || []);
        }
      } catch {
        if (mounted) {
          setOnlineUserIds([]);
        }
      }
    };

    fetchOnlineUsers();
    const intervalId = setInterval(fetchOnlineUsers, ONLINE_POLL_MS);
    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [token]);

  useEffect(() => {
    if (!selectedUser) {
      setMessages([]);
      setTypingByUserId(null);
      setReadReceiptText('');
      return undefined;
    }

    let mounted = true;
    const fetchHistory = async () => {
      try {
        const response = await api.get(`/messages/${selectedUser.id}`);
        if (!mounted) return;
        const sorted = [...response.data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        setMessages(sorted);
      } catch (err) {
        if (mounted) {
          setError(err.response?.data?.detail || 'Could not load chat history.');
        }
      }
    };

    fetchHistory();
    const intervalId = setInterval(fetchHistory, HISTORY_POLL_MS);
    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [selectedUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingByUserId]);

  useEffect(() => () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    const unreadIncoming = messages.some(
      (msg) => msg.sender_id === selectedUser.id && msg.receiver_id === myId && !msg.is_read
    );
    if (!unreadIncoming) return;

    const markRead = async () => {
      try {
        await api.post(`/messages/${selectedUser.id}/read`);
        setMessages((prev) => prev.map((msg) => (
          msg.sender_id === selectedUser.id && msg.receiver_id === myId ? { ...msg, is_read: true } : msg
        )));
      } catch {
        // Do nothing; future refreshes will retry.
      }
    };

    markRead();
  }, [messages, myId, selectedUser]);

  const sendTypingSignal = (isTyping) => {
    if (!selectedUser) return;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({
      type: 'typing',
      receiver_id: selectedUser.id,
      is_typing: isTyping,
    }));
  };

  const handleMessageInput = (event) => {
    setInputMessage(event.target.value);
    sendTypingSignal(true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingSignal(false);
    }, TYPING_STOP_DELAY_MS);
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const cleanMessage = inputMessage.trim();
    if (!cleanMessage || !selectedUser || sending) return;

    setSending(true);
    setError('');

    try {
      const response = await api.post('/messages/', {
        receiver_id: selectedUser.id,
        content: cleanMessage,
      });
      setMessages((prev) => {
        if (response.data.id && prev.some((msg) => msg.id === response.data.id)) return prev;
        return [...prev, response.data];
      });
      setInputMessage('');
      sendTypingSignal(false);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const visibleMessages = useMemo(() => {
    if (!selectedUser) return [];
    return messages
      .filter((msg) => (
        (msg.sender_id === selectedUser.id && msg.receiver_id === myId) ||
        (msg.sender_id === myId && msg.receiver_id === selectedUser.id)
      ))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [messages, myId, selectedUser]);

  const connectionLabel = {
    connected: 'Live',
    connecting: 'Connecting',
    offline: 'Offline fallback',
  }[socketState] || 'Offline fallback';

  if (!token || !Number.isInteger(myId) || myId <= 0) {
    return (
      <section className="page page-chat">
        <div className="status-card">
          <h3>Login required</h3>
          <p>You need to log in before opening messages.</p>
          <Link to="/login" className="btn btn-primary">Go to Login</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="page page-chat">
      <div className="chat-layout card">
        <aside className="chat-sidebar">
          <div className="chat-sidebar-head">
            <h3>Contacts</h3>
            <span className={`socket-pill socket-${socketState}`}>{connectionLabel}</span>
          </div>

          {users.length === 0 ? (
            <p className="status-text">No contacts available.</p>
          ) : (
            users.map((user) => {
              const online = onlineUserIds.includes(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    setSelectedUser(user);
                    setSearchParams({ user: String(user.id) });
                  }}
                  className={`contact-item ${selectedUser?.id === user.id ? 'active' : ''}`}
                >
                  <span className="contact-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
                  <span className="contact-meta">
                    <span>{user.username}</span>
                    <span className={`contact-presence ${online ? 'is-online' : ''}`}>
                      {online ? 'online' : 'offline'}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </aside>

        <section className="chat-main">
          {selectedUser ? (
            <>
              <header className="chat-head">
                <h4>{selectedUser.username}</h4>
                {typingByUserId === selectedUser.id && <span className="typing-indicator">typing...</span>}
              </header>

              <div className="chat-feed">
                {visibleMessages.length === 0 ? (
                  <p className="status-text">No messages yet. Start the conversation.</p>
                ) : (
                  visibleMessages.map((msg) => (
                    <article
                      key={msg.id || `${msg.sender_id}-${msg.created_at}`}
                      className={`message-bubble ${msg.sender_id === myId ? 'mine' : 'theirs'}`}
                    >
                      <p>{msg.content}</p>
                      <time>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </time>
                    </article>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <footer className="chat-foot-meta">
                <span>{readReceiptText}</span>
              </footer>

              <form onSubmit={sendMessage} className="chat-compose">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={handleMessageInput}
                  placeholder="Write a message"
                />
                <button type="submit" className="btn btn-accent" disabled={sending}>
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </form>

              {error && <div className="form-error chat-error">{error}</div>}
            </>
          ) : (
            <div className="chat-empty">
              <h4>Select a contact</h4>
              <p>Pick someone from the left to open your conversation.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

export default Chat;
