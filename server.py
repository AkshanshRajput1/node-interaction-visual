import json
import uuid

from flask import Flask, render_template
from flask_sock import Sock

app = Flask(__name__, static_folder='public',static_url_path='',  template_folder='public')
sock = Sock(app)

nodes = {}

def broadcast(data, exclude_id=None):
    dead = []   # check agar node offline hae , incosistant hae
    for nid, node in nodes.items():
        if nid == exclude_id:
            continue
        try:
            node['ws'].send(json.dumps(data))
        except:
            dead.append(nid)
    for nid in dead:
        nodes.pop(nid, None)

@app.route('/')
def index():
    return render_template('index.html')

@sock.route('/ws')
def websocket(ws):
    node_id = str(uuid.uuid4())[:8].upper()
    nodes[node_id] = {'ws': ws, 'name': node_id}

    ws.send(json.dumps({
            'type': 'welcome',
            'id': node_id,
            'peers': [
                {'id': nid, 'name': n['name']}
                for nid, n in nodes.items()
                if nid != node_id
            ]
        }))

    broadcast({
            'type': 'node_join',
            'id': node_id,
            'name': node_id
        }, exclude_id=node_id)

    try:
            while True:
                raw = ws.receive()
                if raw is None:
                    break

                data = json.loads(raw)
                msg_type = data.get('type')

                if msg_type == 'message':
                    target_id = data.get('to')
                    if target_id and target_id in nodes:
                        nodes[target_id]['ws'].send(json.dumps({
                            'type': 'message',
                            'from': node_id,
                            'text': data.get('text', '')
                        }))
                    else:
                        ws.send(json.dumps({
                            'type': 'error',
                            'text': 'Node not found'
                        }))

                elif msg_type == 'ping':
                    target_id = data.get('to')
                    if target_id and target_id in nodes:
                        nodes[target_id]['ws'].send(json.dumps({
                            'type': 'ping',
                            'from': node_id
                        }))
                        ws.send(json.dumps({
                            'type': 'pong',
                            'from': target_id
                        }))

                elif msg_type == 'broadcast':
                    broadcast({
                        'type': 'message',
                        'from': node_id,
                        'text': data.get('text', ''),
                        'broadcast': True
                    }, exclude_id=node_id)

                elif msg_type == 'file':
                    target_id = data.get('to')
                    if target_id and target_id in nodes:
                        nodes[target_id]['ws'].send(json.dumps({
                            'type': 'file',
                            'from': node_id,
                            'filename': data.get('filename', 'file.txt'),
                            'size': data.get('size', 0)
                        }))

    except Exception as e:
            print(f'[!] Node {node_id} error: {e}')
    finally:
            nodes.pop(node_id, None)
            broadcast({
                'type': 'node_leave',
                'id': node_id
            })
            print(f'[-] Node {node_id} disconnected. Total: {len(nodes)}')

if __name__ == '__main__':
    app.run(debug=True, port=5000)