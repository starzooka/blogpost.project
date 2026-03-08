from fastapi import WebSocket
from typing import Dict, List

class ConnectionManager:
    def __init__(self):
        # Maps user_id to one or more active WebSocket connections (multi-tab/device)
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket | None = None):
        if user_id in self.active_connections:
            if websocket is None:
                del self.active_connections[user_id]
                return

            connections = self.active_connections[user_id]
            if websocket in connections:
                connections.remove(websocket)
            if not connections:
                del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            stale_connections: List[WebSocket] = []
            for ws in self.active_connections[user_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    stale_connections.append(ws)

            if stale_connections:
                for ws in stale_connections:
                    self.disconnect(user_id, ws)

    def get_online_user_ids(self) -> list[int]:
        return list(self.active_connections.keys())

# Create a single instance to be used across the app
manager = ConnectionManager()
