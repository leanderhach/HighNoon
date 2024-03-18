<script lang="ts">
  import HighNoonClient from "$lib/HighNoon/client";
  import HighNoonServer from "$lib/HighNoon/server";

  let client: HighNoonClient;
  let server: HighNoonServer;

  let clientConnected = false;

  async function startRTCClient() {
    client = new HighNoonClient({
      showDebug: true,
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      projectId: "3R9VBppB",
      apiToken: "VfKvPkZj8C7vyz2EsFb1zXXbkRzFYpj0",
    });

    await client.init();
  }

  async function startRTCServer() {
    server = new HighNoonServer({
      showDebug: true,
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      projectId: "3R9VBpp",
      apiToken: "VfKvPkZj8C7vyz2EsFb1zXXbkRzFYpj0",
    });

    console.log(server);

    const { error } = await server.init();

    if (!error) {
      console.log("server started!");
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
{/if}

<style>
  button {
    margin: 3rem;
  }
</style>
