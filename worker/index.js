const title = "Isomock";
const description = "Turn screenshots into tilted, depth-of-field mockups.";
const imageAlt = "A pricing page screenshot tilted in perspective with depth-of-field blur";

const setContent = (value) => ({ element: (element) => element.setAttribute("content", value) });

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (!response.headers.get("content-type")?.includes("text/html")) return response;
    const origin = new URL(request.url).origin;
    const image = `${origin}/og.jpg`;
    return new HTMLRewriter()
      .on('meta[property="og:image"], meta[name="twitter:image"]', setContent(image))
      .on('meta[property="og:image:alt"], meta[name="twitter:image:alt"]', setContent(imageAlt))
      .on("head", {
        element: (head) =>
          head.append(
            [
              `<meta name="description" content="${description}" />`,
              `<meta property="og:type" content="website" />`,
              `<meta property="og:url" content="${origin}/" />`,
              `<meta property="og:title" content="${title}" />`,
              `<meta property="og:description" content="${description}" />`,
              `<meta name="twitter:title" content="${title}" />`,
              `<meta name="twitter:description" content="${description}" />`,
              `<meta name="twitter:site" content="@jalcowastaken" />`,
            ].join(""),
            { html: true },
          ),
      })
      .transform(response);
  },
};
