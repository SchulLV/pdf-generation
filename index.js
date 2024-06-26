const { ReadableStream } = require("web-streams-polyfill");
global.ReadableStream = ReadableStream;

const puppeteer = require("puppeteer");

// Read command line args
const args = process.argv.slice(2);
const pdfContentUrl = args[0];
const fileName = args[1];

if (!pdfContentUrl || !fileName) {
  console.error("Usage: node index.js <pdfContentUrl> <fileName>");
  process.exit(1);
}

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

async function getContent(part) {
  try {
    const response = await fetch(`${pdfContentUrl}?part=${part}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error("Error fetching footer content:", error);
    return "Default footer content";
  }
}

(async () => {
  try {
    const [footerContent, headerContent] = await Promise.all([
      getContent("footer"),
      getContent("header"),
    ]);

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Navigate to the specified URL
    await page.goto(pdfContentUrl, { waitUntil: "networkidle0" });

    // Inject the footer content into the page
    await page.evaluate((footer) => {
      const footerDiv = document.createElement("div");
      footerDiv.id = "custom-footer";
      footerDiv.innerHTML = footer;
      document.body.appendChild(footerDiv);
    }, footerContent);

    // Inject the header content into the page
    await page.evaluate((header) => {
      const headerDiv = document.createElement("div");
      headerDiv.id = "custom-header";
      headerDiv.innerHTML = header;
      document.body.insertBefore(headerDiv, document.body.firstChild);
    }, headerContent);

    // Add a script to move the header and footer content when printing
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.textContent = `
            @media print {
              body {
                height: 100%;
                font-size: 13px;
              }
              #custom-footer {
                margin-top: 20px;
              }
            };
          `;
      document.head.appendChild(style);
    });

    // Wait for images to load
    await page.evaluate(async () => {
      const images = Array.from(document.images);
      await Promise.all(
        images.map((img) => {
          if (img.complete) return;
          return new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
        }),
      );
    });

    const pdf = await page.pdf({
      path: fileName,
      format: "A4",
      printBackground: true,
      margin: {
        top: "50px",
        bottom: "50px",
        right: "0px",
        left: "20px",
      },
      // displayHeaderFooter: true,
      // footerTemplate: `
      //   <div style="width: 100%; text-align: center; font-size: 10px;">
      //     ${footerContent}
      //   </div>
      // `,
      // This did not work. The footer and header Template are only good for non dynamic content
    });

    console.log("PDF generated successfully!");

    await browser.close();
  } catch (error) {
    console.error("An error occurred:", error);
  }
})();
