export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/auth") {
      const state = crypto.randomUUID();
      const redirect = new URL("https://github.com/login/oauth/authorize");
      redirect.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      redirect.searchParams.set("redirect_uri", `${env.PUBLIC_URL}/callback`);
      redirect.searchParams.set("scope", "repo");
      redirect.searchParams.set("state", state);

      return Response.redirect(redirect.toString(), 302);
    }

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");

      if (!code) {
        return new Response("Missing code", { status: 400 });
      }

      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${env.PUBLIC_URL}/callback`
        })
      });

      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        return new Response(`OAuth failed: ${JSON.stringify(tokenData)}`, { status: 400 });
      }

      const html = `
<!doctype html>
<html>
  <body>
    <script>
      window.opener.postMessage(
        'authorization:github:success:${tokenData.access_token}',
        '*'
      );
      window.close();
    </script>
    Login complete.
  </body>
</html>`;

      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};