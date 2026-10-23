from fastapi import WebSocket

connections = []

async def connect(ws: WebSocket):
    await ws.accept()
    connections.append(ws)

async def disconnect(ws: WebSocket):
    if ws in connections:
        connections.remove(ws)

async def broadcast(message: dict):
    dead = []
    for connection in connections:
        try:
            await connection.send_json(message)
        except:
            dead.append(connection)

    for d in dead:
        connections.remove(d)