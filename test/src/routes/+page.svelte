<script lang="ts">
  import { HighNoonClient, HighNoonServer } from "$lib/highnoon";
  import { parse } from "svelte/compiler";

  let client: HighNoonClient;
  let server: HighNoonServer;

  let clientConnected = false;
  let clientCanMessage = false;

  async function startRTCClient() {
    if (client) return;

    client = new HighNoonClient({
      projectId: "3R9VBppB",
      apiToken: "VfKvPkZj8C7vyz2EsFb1zXXbkRzFYpj0",
      showDebug: true,
    });

    await client.init();
    const { data, error } = await client.connectToRoom(roomName);
    console.log(data, error)

    client.on("serverConnectionEstablished", async () => {
      const { data: clients, error: thing } = await client.getConnectedClients();
      console.log(clients, thing);
      clientConnected = true;
    });

    client.on("clientListUpdated", (data) => {
      console.log("the list of clients was updated")
      console.log(data)
    })

    client.on("packet", (data) => {
      console.log("Response from")
      console.log(data);
      client.send({thing: "hello", other: "world"});
    })

    client.on("relayFromServer", (data) => {
      console.log("we got a relay message from the server");
      console.log(data);
    })
  }

  async function startRTCServer() {
    server = new HighNoonServer({
      projectId: "3R9VBppB",
      apiToken: "VfKvPkZj8C7vyz2EsFb1zXXbkRzFYpj0",
      showDebug: true,
    });

    const { error } = await server.init();

    if (!error) {
      const { data, error } = await server.createRoom();
      console.log(data!.room);

    server.on("packet", (data) => {
      console.log(data);
    })

    server.on("clientConnected", () => {
      console.log("a new client has connected")
    })

    server.on("relay", (data) => {
      console.log("we got a relay message from a client");
      console.log(data);

      server.send(data.meta.userId, {
        "type": "seedItem",
        "table": "gameSettings",
        "data": [
            {
                "name": "dsada",
                "connectedPlayers": 1,
                "id": 1
            }
        ]
    });
    })

    server.on("clientDisconnected", (data) => {
      console.log("a client has disconnected")
      console.log(data)
    })
    }
  }

  async function sendServerMessage() {
    if (!server) {
      console.log("server does not exist yet");
      return;
    }

    server.broadcast("hello from server");
  }

  async function sendSafe() {
    console.log("its calling this")
    server.relay("hello from server");
  }

  async function sendClientMessage() {
    if (!client) {
      console.log("client does not exist yet");
      return;
    }

    client.relayTo("server", "hello from client");
  }

  let roomName = "";
</script>

<button on:click={startRTCServer}>Start Server</button>
<input type="text" bind:value={roomName} />
<button on:click={startRTCClient}>Join Room</button>
{#if clientConnected}
  {client.currentRoom}
  <button on:click={sendClientMessage}>Send From Client</button>
{/if}
{#if server}
  <button on:click={sendServerMessage}>Send From Server</button>
  <button on:click={sendSafe}>Send Safe</button>
{/if}

<style>
  button {
    margin: 3rem;
  }
</style>
