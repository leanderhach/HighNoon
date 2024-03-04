<script>
    import HighNoonClient from "$lib/HighNoon/client";


    async function startRTCServer() {
        const client = new HighNoonClient({
            showDebug: true,
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
            ]
        });

        await client.initialize();
    }
</script>




<button on:click={startRTCServer}>click to message</button>