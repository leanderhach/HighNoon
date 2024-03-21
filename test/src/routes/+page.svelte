<script lang="ts">
  import { HighNoonClient, HighNoonServer } from "highnoon";
  
  let client: HighNoonClient;
  let server: HighNoonServer;

  let clientConnected = false;
  let clientCanMessage = false;

  async function startRTCClient() {
    if(client) return;
    
    client = new HighNoonClient({
      showDebug: true,
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      projectId: "3R9VBppB",
      apiToken: "VfKvPkZj8C7vyz2EsFb1zXXbkRzFYpj0",
    });

    await client.init();

    client.on("serverConnectionEstablished", () => {
      clientCanMessage = true;
    });
  }

  async function startRTCServer() {
    server = new HighNoonServer({
      showDebug: true,
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      projectId: "3R9VBppB",
      apiToken: "VfKvPkZj8C7vyz2EsFb1zXXbkRzFYpj0",
    });

    const { error } = await server.init();

    if (!error) {
      const { data, error } = await server.createRoom();
      console.log(data!.room);
    }
  }

  async function JoinRoom() {
    if (!client) {
      console.log("client does not exist yet");
      return;
    }

    const { data, error } = await client.connectToRoom(roomName);

    if (client.connectedToRoom) {
      clientConnected = true;
    }
  }

  async function sendClientHello() {
    if (!client) {
      console.log("client does not exist yet");
      return;
    }

    client.sendMessage("hello world");
  }

  async function sendArbitrary() {
    if (!client) {
      console.log("client does not exist yet");
      return;
    }

    client.sendMessage("arbitray message");
  }

  async function sendJoke() {
    if (!client) {
      console.log("client does not exist yet");
      return;
    }

    client.sendMessage("why did the chicken cross the road?");
  }

  async function sendServerMessage() {
    if (!server) {
      console.log("server does not exist yet");
      return;
    }

    server.sendMessageToAll("hello from server");
  }

  let roomName = "";
</script>

<button on:click={startRTCServer}>Start Server</button>
<button on:click={startRTCClient}>Start Client</button>
{#if client}
  <input type="text" bind:value={roomName} />
  <button on:click={JoinRoom}>Join Room</button>
  {#if clientConnected}
    {client.currentRoom}
  {/if}
  {#if clientCanMessage}
    <button on:click={sendClientHello}>Send Hello</button>
    <button on:click={sendArbitrary}>Send Arbitrary</button>
    <button on:click={sendJoke}>Send Joke</button>
  {/if}
{/if}
{#if server}
  <button on:click={sendServerMessage}>Send From Server</button>
{/if}

<style>
  button {
    margin: 3rem;
  }
</style>
