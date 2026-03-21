import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper to clean price
  const cleanPrice = (rawPrice: any) => {
    if (typeof rawPrice === 'number') return (rawPrice / 100).toString();
    if (typeof rawPrice !== 'string') return String(rawPrice || "0.00");
    const matches = rawPrice.match(/[\d,.]+/g);
    if (matches && matches.length > 0) {
      const validMatches = matches.filter(m => /\d/.test(m));
      if (validMatches.length > 0) {
        let p = validMatches[validMatches.length - 1];
        p = p.replace(/,/g, '');
        if (p.endsWith('.')) p = p.slice(0, -1);
        return p;
      }
    }
    return rawPrice;
  };

  // API Route for product collection
  app.post("/api/collect", async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "必须提供 URL" });
    }

    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        timeout: 10000,
      });

      // Handle JSON response (e.g., Shopify .js or .json endpoints)
      if (typeof response.data === 'object' && response.data !== null) {
        const d = response.data;
        return res.json({
          success: true,
          data: {
            title: d.title || "",
            description: d.description || "",
            image: d.featured_image || (d.images && d.images[0]) || "",
            price: cleanPrice(d.price),
            marketPrice: cleanPrice(d.compare_at_price || d.price),
            type: d.type || d.product_type || "未分类",
            tags: d.tags || [],
            url,
            status: "正常销售",
            subtitle: "",
            handle: d.handle || "",
            supplier: d.vendor || "",
            supplierName: "",
            supplierLink: "",
            carouselImages: d.images || [],
            options: d.options ? d.options.map((opt: any) => ({
              name: opt.name,
              values: opt.values
            })) : [],
            variants: d.variants ? d.variants.map((v: any) => ({
              id: v.id.toString(),
              title: v.title,
              sku: v.sku || "",
              price: cleanPrice(v.price),
              marketPrice: cleanPrice(v.compare_at_price || v.price),
              inventory: v.inventory_quantity || 1000,
              image: v.featured_image ? v.featured_image.src : null,
              options: v.options || []
            })) : []
          }
        });
      }

      const $ = cheerio.load(response.data);
      
      // Basic extraction logic
      const title = $("title").text().trim() || 
                    $('meta[property="og:title"]').attr("content") || 
                    $("h1").first().text().trim();
      
      const description = $('meta[name="description"]').attr("content") || 
                          $('meta[property="og:description"]').attr("content") || 
                          "";
      
      const image = $('meta[property="og:image"]').attr("content") || 
                    $("img").first().attr("src") || 
                    "";

      const type = $('meta[property="product:type"]').attr("content") || "";
      const tags: string[] = [];
      $('meta[property="product:tag"]').each((i, el) => {
        const tag = $(el).attr("content");
        if (tag) tags.push(tag);
      });

      // Try to find price (very basic heuristic)
      let price = "";
      const priceSelectors = [
        '[class*="price"]', 
        '[id*="price"]', 
        ".amount", 
        ".current-price",
        'meta[property="product:price:amount"]'
      ];
      
      for (const selector of priceSelectors) {
        const found = $(selector).first();
        if (found.length) {
          if (selector.startsWith('meta')) {
            price = found.attr('content') || "";
          } else {
            price = found.text().trim();
          }
          if (price) break;
        }
      }

      const displayPrice = cleanPrice(price);

      res.json({
        success: true,
        data: {
          title,
          description,
          image: image.startsWith("/") ? new URL(image, url).href : image,
          price: displayPrice,
          type,
          tags,
          url
        },
      });
    } catch (error: any) {
      console.error("Scraping error:", error.message);
      res.status(500).json({ error: "无法从提供的 URL 采集数据。" });
    }
  });

  // API Route for product series collection
  app.post("/api/collect-series", async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "必须提供 URL" });
    }

    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);

      // Heuristic to find product items in a list/grid
      const itemSelectors = [
        '.product-item', '.product-card', '.grid__item', '.product-block',
        '.item', 'article', '[class*="product-grid-item"]',
        '[class*="product"]', '[class*="item"]'
      ];

      let foundItems = $();
      let maxUniqueLinks = 0;

      for (const selector of itemSelectors) {
        const items = $(selector).filter((i, el) => {
          const $el = $(el);
          const hasProductLink = $el.find('a[href*="/products/"]').length > 0;
          const hasImg = $el.find('img').length > 0;
          const hasPrice = $el.find('[class*="price"], [id*="price"], .amount, .money').length > 0;
          
          return (hasProductLink || $el.find('a').length > 0) && hasImg && hasPrice;
        });

        const uniqueLinks = new Set();
        items.each((i, el) => {
          const link = $(el).find('a').first().attr('href');
          if (link) uniqueLinks.add(link);
        });

        if (uniqueLinks.size > maxUniqueLinks) {
          maxUniqueLinks = uniqueLinks.size;
          foundItems = items;
        }
      }

      if (maxUniqueLinks === 0) {
        for (const selector of itemSelectors) {
          const items = $(selector).filter((i, el) => {
            const hasLink = $(el).find('a[href*="/products/"]').length > 0;
            const hasImg = $(el).find('img').length > 0;
            return hasLink && hasImg;
          });
          const uniqueLinks = new Set();
          items.each((i, el) => {
            const link = $(el).find('a').first().attr('href');
            if (link) uniqueLinks.add(link);
          });
          if (uniqueLinks.size > maxUniqueLinks) {
            maxUniqueLinks = uniqueLinks.size;
            foundItems = items;
          }
        }
      }

      const seenUrls = new Set();
      const productUrls: string[] = [];

      foundItems.each((i, el) => {
        const $el = $(el);
        let link = $el.find('a[href*="/products/"]').first();
        if (link.length === 0) {
          link = $el.find('a').filter((i, a) => {
            const href = $(a).attr('href');
            return !!href && !href.startsWith('#') && !href.includes('javascript:');
          }).first();
        }
        
        let productUrl = link.attr('href') || "";
        if (!productUrl) return;

        if (productUrl && !productUrl.startsWith('http')) {
          productUrl = new URL(productUrl, url).href;
        }

        const normalizedUrl = productUrl.split('?')[0].replace(/\/$/, '');
        if (seenUrls.has(normalizedUrl) || normalizedUrl === url.split('?')[0].replace(/\/$/, '')) return;
        seenUrls.add(normalizedUrl);
        productUrls.push(normalizedUrl);
      });

      const products: any[] = [];
      const limit = 30;
      const urlsToFetch = productUrls.slice(0, limit);

      for (let i = 0; i < urlsToFetch.length; i++) {
        const pUrl = urlsToFetch[i];
        try {
          const jsUrl = pUrl.endsWith('.js') ? pUrl : `${pUrl}.js`;
          const productResponse = await axios.get(jsUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
            timeout: 5000,
          });

          const d = productResponse.data;
          if (d && d.title) {
            products.push({
              title: d.title,
              description: d.description || "从系列页面采集",
              image: d.featured_image || (d.images && d.images[0]) || "",
              price: cleanPrice(d.price),
              marketPrice: cleanPrice(d.compare_at_price || d.price),
              type: d.type || d.product_type || "未分类",
              tags: d.tags || [],
              url: pUrl,
              status: "正常销售",
              subtitle: "",
              handle: d.handle || "",
              supplier: d.vendor || "",
              supplierName: "",
              supplierLink: "",
              carouselImages: d.images || [],
              options: d.options ? d.options.map((opt: any) => ({
                name: opt.name,
                values: opt.values
              })) : [],
              variants: d.variants ? d.variants.map((v: any) => ({
                id: v.id.toString(),
                title: v.title,
                sku: v.sku || "",
                price: cleanPrice(v.price),
                marketPrice: cleanPrice(v.compare_at_price || v.price),
                inventory: v.inventory_quantity || 1000,
                image: v.featured_image ? v.featured_image.src : null,
                options: v.options || []
              })) : []
            });
          }
        } catch (err: any) {
          console.error(`Failed to fetch product data for ${pUrl}:`, err.message);
        }
      }

      res.json({
        success: true,
        count: products.length,
        data: products,
      });
    } catch (error: any) {
      console.error("Series scraping error:", error.message);
      res.status(500).json({ error: "无法从提供的系列 URL 采集数据。" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
