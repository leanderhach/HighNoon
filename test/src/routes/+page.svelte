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

    console.log(data, error);

    client.on("serverConnectionEstablished", async () => {
      const { data: clients, error: thing } = await client.getConnectedClients();
      console.log(clients, thing);
    });
  }

  async function startRTCServer() {
    server = new HighNoonServer({
      projectId: "3R9VBppB",
      apiToken: "VfKvPkZj8C7vyz2EsFb1zXXbkRzFYpj0",
      showDebug: true,
    });

    const { error } = await server.init();

    // if (!error) {
    //   const { data, error } = await server.createRoom();
    //   console.log(data!.room);
    // }
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
    server.broadcastSafe("hello from server");
  }

  let roomName = "";
</script>

<button on:click={startRTCServer}>Start Server</button>
<input type="text" bind:value={roomName} />
<button on:click={startRTCClient}>Join Room</button>
{#if clientConnected}
  {client.currentRoom}
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
