const puppeteer = require("puppeteer");
const axios = require("axios");
const xml2js = require("xml2js");
const fs = require("fs");
const path = require("path");
const TurndownService = require("turndown");

const URL_GITBOOK = "https://octorate.gitbook.io/product-docs";

// Initialize TurndownService
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

async function fetchSitemap(url) {
  try {
    const response = await axios.get(url);
    const sitemapXML = response.data;

    const parsedSitemap = await xml2js.parseStringPromise(sitemapXML);

    if (parsedSitemap.sitemapindex && parsedSitemap.sitemapindex.sitemap) {
      let allUrls = [];
      const sitemaps = parsedSitemap.sitemapindex.sitemap;
      for (const sitemap of sitemaps) {
        const subSitemapUrl = sitemap.loc[0];
        const subUrls = await fetchSitemap(subSitemapUrl);
        if (subUrls) {
          allUrls = allUrls.concat(subUrls);
        }
      }
      return allUrls;
    }

    if (parsedSitemap.urlset && parsedSitemap.urlset.url) {
      const urls = parsedSitemap.urlset.url;
      return urls.map((url) => url.loc[0]);
    }

    return [];
  } catch (error) {
    console.error("Error fetching or parsing sitemap:", error);
  }
}

async function extractPageContent(page, url) {
  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "networkidle2" });

    const htmlContent = await page.evaluate(() => {
      // Remove unwanted elements
      const selectorsToRemove = [
        "aside.relative.group.flex.flex-col.basis-full.bg-light",
        "div.flex.md\\:w-56.grow-0.shrink-0.justify-self-end",
        "div.flex.flex-col.md\\:flex-row.mt-6.gap-2.max-w-3xl.mx-auto.page-api-block\\:ml-0",
        "div.flex.flex-row.items-center.mt-6.max-w-3xl.mx-auto.page-api-block\\:ml-0",
        "header",
        "nav"
      ];
      
      selectorsToRemove.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) el.remove();
      });

      const main = document.querySelector('main');
      if (main) return main.innerHTML;
      
      return document.body.innerHTML;
    });

    // Convert HTML to Markdown
    let markdown = turndownService.turndown(htmlContent);
    
    // Add a title and source URL to separate pages
    const separator = `\n\n---\n\n# Source: ${url}\n\n`;
    
    fs.appendFileSync(OUTPUT_FILE, separator + markdown);
    
    console.log(`Extracted content from: ${url}`);
  } catch (error) {
    console.error(`Failed to extract content for: ${url}`, error);
  }
}

const OUTPUT_FILE = "gitbook_content.md";

async function run() {
  const sitemapUrl = `${URL_GITBOOK}/sitemap.xml`; 

  // Initialize/clear the output file
  fs.writeFileSync(OUTPUT_FILE, `# GitBook Content\n\nGenerated from: ${URL_GITBOOK}\n`);

  const urls = await fetchSitemap(sitemapUrl);
  if (!urls) return;

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  for (const url of urls) {
    await extractPageContent(page, url);
  }

  await browser.close();
  console.log(`\nFinished! All content saved to ${OUTPUT_FILE}`);
}

run().catch(console.error);
