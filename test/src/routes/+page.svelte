<script>
  import HighNoonClient from "$lib/HighNoon/client";
  import HighNoonServer from "$lib/HighNoon/server";

  async function startRTCClient() {
    const client = new HighNoonClient({
      showDebug: true,
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      projectId: "3R9VBppB",
      apiToken: "VfKvPkZj8C7vyz2EsFb1zXXbkRzFYpj0",
    });

    await client.initialize();
  }

  async function startRTCServer() {
    const server = new HighNoonServer({
      showDebug: true,
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      projectId: "3R9VBpp",
      apiToken: "VfKvPkZj8C7vyz2EsFb1zXXbkRzFYpj0",
    });

    await server.initialize();
  }
</script>

<button on:click={startRTCServer}>Start Server</button>
<button on:click={startRTCClient}>Start Client</button>


<style>
  button {
    margin: 3rem;
  }
</style>