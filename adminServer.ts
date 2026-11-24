import http from "node:http";
import { URLSearchParams } from "node:url";
import { supabase } from "./supabase.js";
import { getActiveItems } from "./items.js";
import { getShopSnapshot } from "./shopPricing.js";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readFormBody(req: http.IncomingMessage): Promise<URLSearchParams> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 100_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => resolve(new URLSearchParams(raw)));
    req.on("error", reject);
  });
}

function checkPassword(input: string | null): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return input === expected;
}

function renderLoginPage(): string {
  return [
    "<!doctype html>",
    '<html lang="vi">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    "  <title>Đăng nhập Quản Trị</title>",
    "  <style>",
    "    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 16px; }",
    "    .card { background: #1e293b; padding: 24px; border-radius: 12px; width: 100%; max-width: 360px; }",
    "    input, button { width: 100%; padding: 10px 12px; margin-top: 12px; border-radius: 8px; border: 1px solid #334155; box-sizing: border-box; font-size: 15px; }",
    "    input { background: #0f172a; color: #fff; }",
    "    button { background: #f59e0b; color: #0f172a; font-weight: 700; border: none; cursor: pointer; }",
    "  </style>",
    "</head>",
    "<body>",
    '  <form class="card" method="GET" action="/admin">',
    '    <h2 style="margin:0 0 8px">Hoạ Đồ — Quản Trị</h2>',
    '    <p style="margin:0;color:#94a3b8;font-size:14px">Nhập mật khẩu ADMIN_PASSWORD để quản lý.</p>',
    '    <input type="password" name="pw" placeholder="Mật khẩu quản trị" required />',
    '    <button type="submit">Mở trang quản lý</button>',
    "  </form>",
    "</body>",
    "</html>",
  ].join("\n");
}

export function startAdminAndHealthServer(): void {
  const port = process.env.PORT || 3000;

  http
    .createServer(async (req, res) => {
      const reqUrl = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`
      );

      // 1. Giữ cổng healthcheck cho UptimeRobot (GET & HEAD)
      if (
        (req.method === "GET" || req.method === "HEAD") &&
        reqUrl.pathname === "/"
      ) {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        if (req.method === "HEAD") {
          res.end();
        } else {
          res.end("Bot Hoa Do Thien Nien Mong dang hoat dong!");
        }
        return;
      }

      // 2. Lưu vật phẩm (Tab 1)
      if (req.method === "POST" && reqUrl.pathname === "/admin/save") {
        try {
          const form = await readFormBody(req);
          const password = form.get("password") ?? "";
          if (!checkPassword(password)) {
            res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              "<h3>Sai mật khẩu quản trị! <a href='/admin'>Quay lại</a></h3>"
            );
            return;
          }

          const code = (form.get("code") ?? "").trim().toLowerCase();
          const name = (form.get("name") ?? "")
            .normalize("NFC")
            .trim()
            .replace(/\s+/g, " ");
          const rarity = (form.get("rarity") ?? "Thường").trim();
          const dropPercent = Number(form.get("drop_percent") ?? "0");
          const description = (form.get("description") ?? "").trim();
          const isActive = form.get("is_active") === "on";

          if (
            !code ||
            !name ||
            Number.isNaN(dropPercent) ||
            dropPercent < 0 ||
            dropPercent > 100
          ) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              "<h3>Dữ liệu không hợp lệ. <a href='javascript:history.back()'>Quay lại</a></h3>"
            );
            return;
          }

          const { error } = await supabase.from("discord_items").upsert(
            {
              code,
              name,
              rarity,
              drop_rate: dropPercent / 100,
              description,
              is_active: isActive,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "code" }
          );

          if (error) {
            res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              `<h3>Lỗi lưu Supabase: ${escapeHtml(error.message)}</h3>`
            );
            return;
          }

          await getActiveItems(true);

          res.writeHead(302, {
            Location: `/admin?pw=${encodeURIComponent(password)}&tab=items&saved=1`,
          });
          res.end();
        } catch (err) {
          console.error("Lỗi xử lý form admin:", err);
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Lỗi máy chủ khi lưu dữ liệu.");
        }
        return;
      }

      // 3. Lưu công thức trồng trọt (Tab 2)
      if (req.method === "POST" && reqUrl.pathname === "/admin/save-recipe") {
        try {
          const form = await readFormBody(req);
          const password = form.get("password") ?? "";
          if (!checkPassword(password)) {
            res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              "<h3>Sai mật khẩu quản trị! <a href='/admin'>Quay lại</a></h3>"
            );
            return;
          }

          const seedCode = (form.get("seed_item_code") ?? "")
            .trim()
            .toLowerCase();
          const harvestCode = (form.get("harvest_item_code") ?? "")
            .trim()
            .toLowerCase();
          const harvestQty = Math.max(
            1,
            Number.parseInt(form.get("harvest_quantity") ?? "1", 10) || 1
          );
          const growSeconds = Math.max(
            5,
            Number.parseInt(form.get("grow_seconds") ?? "120", 10) || 120
          );

          if (!seedCode || !harvestCode) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              "<h3>Vui lòng chọn đầy đủ hạt giống và nông sản. <a href='javascript:history.back()'>Quay lại</a></h3>"
            );
            return;
          }

          const { error } = await supabase.from("discord_crop_recipes").upsert(
            {
              seed_item_code: seedCode,
              harvest_item_code: harvestCode,
              harvest_quantity: harvestQty,
              grow_seconds: growSeconds,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "seed_item_code" }
          );

          if (error) {
            res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              `<h3>Lỗi lưu công thức: ${escapeHtml(error.message)}</h3>`
            );
            return;
          }

          res.writeHead(302, {
            Location: `/admin?pw=${encodeURIComponent(password)}&tab=recipes&saved=1`,
          });
          res.end();
        } catch (err) {
          console.error("Lỗi lưu recipe:", err);
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Lỗi máy chủ khi lưu công thức.");
        }
        return;
      }

      // 4. Lưu cấu hình biến động Shop (Tab 3)
      if (req.method === "POST" && reqUrl.pathname === "/admin/save-shop-config") {
        try {
          const form = await readFormBody(req);
          const password = form.get("password") ?? "";
          if (!checkPassword(password)) {
            res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              "<h3>Sai mật khẩu quản trị! <a href='/admin'>Quay lại</a></h3>"
            );
            return;
          }

          const cycleSeconds = Math.max(
            10,
            Number.parseInt(form.get("cycle_seconds") ?? "3600", 10) || 3600
          );
          const randomItemCount = Math.max(
            0,
            Number.parseInt(form.get("random_item_count") ?? "3", 10) || 0
          );
          const maxChangePercent = Math.max(
            0,
            Math.min(95, Number(form.get("max_change_percent") ?? "30") || 0)
          );

          const { error } = await supabase.from("discord_shop_config").upsert(
            {
              id: 1,
              cycle_seconds: cycleSeconds,
              random_item_count: randomItemCount,
              max_change_percent: maxChangePercent,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );

          if (error) {
            res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              `<h3>Lỗi lưu cấu hình shop: ${escapeHtml(error.message)}</h3>`
            );
            return;
          }

          res.writeHead(302, {
            Location: `/admin?pw=${encodeURIComponent(password)}&tab=shop&saved=1`,
          });
          res.end();
        } catch (err) {
          console.error("Lỗi lưu shop config:", err);
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Lỗi máy chủ khi lưu cấu hình shop.");
        }
        return;
      }

      // 5. Lưu giá gốc & bật/tắt bán trong Shop cho 1 vật phẩm (Tab 3)
      if (req.method === "POST" && reqUrl.pathname === "/admin/save-base-price") {
        try {
          const form = await readFormBody(req);
          const password = form.get("password") ?? "";
          if (!checkPassword(password)) {
            res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              "<h3>Sai mật khẩu quản trị! <a href='/admin'>Quay lại</a></h3>"
            );
            return;
          }

          const code = (form.get("item_code") ?? "").trim().toLowerCase();
          const basePrice = Math.max(
            0,
            Number.parseInt(form.get("base_price") ?? "0", 10) || 0
          );
          const shopEnabled = form.get("shop_enabled") === "on";

          if (!code) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              "<h3>Thiếu mã vật phẩm. <a href='javascript:history.back()'>Quay lại</a></h3>"
            );
            return;
          }

          const { error } = await supabase
            .from("discord_items")
            .update({
              base_price: basePrice,
              shop_enabled: shopEnabled,
              updated_at: new Date().toISOString(),
            })
            .eq("code", code);

          if (error) {
            res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              `<h3>Lỗi lưu giá gốc: ${escapeHtml(error.message)}</h3>`
            );
            return;
          }

          await getActiveItems(true);

          res.writeHead(302, {
            Location: `/admin?pw=${encodeURIComponent(password)}&tab=shop&saved=1`,
          });
          res.end();
        } catch (err) {
          console.error("Lỗi lưu base price:", err);
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Lỗi máy chủ khi lưu giá gốc.");
        }
        return;
      }

      // 6. Giao diện trang quản trị /admin (3 Tab)
      if (req.method === "GET" && reqUrl.pathname === "/admin") {
        const pw = reqUrl.searchParams.get("pw") ?? "";
        const saved = reqUrl.searchParams.get("saved") === "1";
        const tabParam = reqUrl.searchParams.get("tab");
        const activeTab =
          tabParam === "recipes"
            ? "recipes"
            : tabParam === "shop"
              ? "shop"
              : "items";

        if (!checkPassword(pw)) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderLoginPage());
          return;
        }

        const [{ data: itemsData }, { data: recipesData }, shopSnapshot] =
          await Promise.all([
            supabase
              .from("discord_items")
              .select(
                "code, name, rarity, drop_rate, description, is_active, base_price, shop_enabled"
              )
              .order("drop_rate", { ascending: false }),
            supabase
              .from("discord_crop_recipes")
              .select(
                "seed_item_code, harvest_item_code, harvest_quantity, grow_seconds"
              )
              .order("grow_seconds", { ascending: true }),
            getShopSnapshot(),
          ]);

        const items = itemsData ?? [];
        const recipes = recipesData ?? [];
        const itemNameMap = new Map(items.map((i) => [i.code, i.name]));
        const shopPricingMap = new Map(
          shopSnapshot.items.map((s) => [s.code, s])
        );

        const totalPercent = items
          .filter((i) => i.is_active)
          .reduce((sum, i) => sum + Number(i.drop_rate ?? 0) * 100, 0);

        const itemOptionsHtml = items
          .map(
            (i) =>
              `<option value="${escapeHtml(i.code)}">${escapeHtml(i.name)} (${escapeHtml(i.code)})</option>`
          )
          .join("");

        const rowsHtml = items
          .map((item) => {
            const pct = (Number(item.drop_rate ?? 0) * 100)
              .toFixed(2)
              .replace(/\.00$/, "");
            return [
              "<tr>",
              `  <td><code>${escapeHtml(item.code)}</code></td>`,
              `  <td><strong>${escapeHtml(item.name)}</strong></td>`,
              `  <td>${escapeHtml(item.rarity)}</td>`,
              `  <td>${pct}%</td>`,
              `  <td>${item.is_active ? "Đang bật" : "Đã ẩn"}</td>`,
              `  <td style="color:#94a3b8;font-size:13px">${escapeHtml(item.description ?? "")}</td>`,
              "  <td>",
              '    <button type="button" class="btn-edit"',
              `      data-code="${escapeHtml(item.code)}"`,
              `      data-name="${escapeHtml(item.name)}"`,
              `      data-rarity="${escapeHtml(item.rarity)}"`,
              `      data-pct="${pct}"`,
              `      data-desc="${escapeHtml(item.description ?? "")}"`,
              `      data-active="${item.is_active ? "1" : "0"}"`,
              '      onclick="editItem(this)">Sửa</button>',
              "  </td>",
              "</tr>",
            ].join("\n");
          })
          .join("\n");

        const recipeRowsHtml = recipes
          .map((r) => {
            const seedLabel = itemNameMap.get(r.seed_item_code)
              ? `${itemNameMap.get(r.seed_item_code)} (${r.seed_item_code})`
              : r.seed_item_code;
            const harvestLabel = itemNameMap.get(r.harvest_item_code)
              ? `${itemNameMap.get(r.harvest_item_code)} (${r.harvest_item_code})`
              : r.harvest_item_code;

            return [
              "<tr>",
              `  <td><strong>${escapeHtml(seedLabel)}</strong></td>`,
              `  <td>${escapeHtml(harvestLabel)}</td>`,
              `  <td>x${r.harvest_quantity}</td>`,
              `  <td><strong>${r.grow_seconds}s</strong></td>`,
              "  <td>",
              '    <button type="button" class="btn-edit"',
              `      data-seed="${escapeHtml(r.seed_item_code)}"`,
              `      data-harvest="${escapeHtml(r.harvest_item_code)}"`,
              `      data-qty="${r.harvest_quantity}"`,
              `      data-grow="${r.grow_seconds}"`,
              '      onclick="editRecipe(this)">Sửa</button>',
              "  </td>",
              "</tr>",
            ].join("\n");
          })
          .join("\n");

        const shopPriceRowsHtml = items
          .map((item) => {
            const baseP = Math.max(0, Number(item.base_price ?? 0));
            const enabled = item.shop_enabled !== false;
            const defaultSell =
              baseP > 0 ? Math.max(1, Math.floor(baseP * 0.8)) : 0;
            const live = shopPricingMap.get(item.code);
            const deltaText =
              live && live.changePercent !== 0
                ? live.changePercent > 0
                  ? `+${live.changePercent}%`
                  : `${live.changePercent}%`
                : "0%";
            const currentLabel = !enabled
              ? "Đã tắt bán"
              : live && live.buyPrice > 0
                ? `Mua ${live.buyPrice} / Bán ${live.sellPrice} (${deltaText})`
                : baseP > 0
                  ? `Mua ${baseP} / Bán ${defaultSell}`
                  : "Chưa đặt giá";

            return [
              "<tr>",
              `  <td><strong>${escapeHtml(item.name)}</strong> <code>${escapeHtml(item.code)}</code></td>`,
              `  <td><strong>${baseP}</strong></td>`,
              `  <td>${defaultSell}</td>`,
              `  <td>${enabled ? "Đang bật" : "Đã tắt"}</td>`,
              `  <td style="color:#94a3b8;font-size:13px">${escapeHtml(currentLabel)}</td>`,
              "  <td>",
              '    <button type="button" class="btn-edit"',
              `      data-code="${escapeHtml(item.code)}"`,
              `      data-name="${escapeHtml(item.name)}"`,
              `      data-base="${baseP}"`,
              `      data-shop="${enabled ? "1" : "0"}"`,
              '      onclick="editBasePrice(this)">Sửa giá</button>',
              "  </td>",
              "</tr>",
            ].join("\n");
          })
          .join("\n");

        const totalPctLabel = totalPercent.toFixed(2).replace(/\.00$/, "");
        const pwAttr = escapeHtml(pw);

        const clientScript = [
          "<script>",
          "function switchTab(tab) {",
          "  ['items', 'recipes', 'shop'].forEach(function(t) {",
          "    document.getElementById('panel-' + t).classList.toggle('active', t === tab);",
          "    document.getElementById('btn-tab-' + t).classList.toggle('active', t === tab);",
          "  });",
          "}",
          "function editItem(btn) {",
          "  switchTab('items');",
          "  document.getElementById('f-code').value = btn.dataset.code || '';",
          "  document.getElementById('f-name').value = btn.dataset.name || '';",
          "  document.getElementById('f-rarity').value = btn.dataset.rarity || 'Thường';",
          "  document.getElementById('f-pct').value = btn.dataset.pct || '0';",
          "  document.getElementById('f-desc').value = btn.dataset.desc || '';",
          "  document.getElementById('f-active').checked = btn.dataset.active === '1';",
          "  document.getElementById('item-form-title').textContent = 'Đang sửa vật phẩm: ' + (btn.dataset.name || btn.dataset.code);",
          "  document.getElementById('item-submit-btn').textContent = 'Cập nhật vật phẩm';",
          "  document.getElementById('item-form').scrollIntoView({ behavior: 'smooth' });",
          "}",
          "function resetItemForm() {",
          "  document.getElementById('item-form').reset();",
          "  document.getElementById('f-active').checked = true;",
          "  document.getElementById('item-form-title').textContent = 'Thêm mới hoặc Cập nhật vật phẩm';",
          "  document.getElementById('item-submit-btn').textContent = 'Lưu vật phẩm';",
          "}",
          "function editRecipe(btn) {",
          "  switchTab('recipes');",
          "  document.getElementById('r-seed').value = btn.dataset.seed || '';",
          "  document.getElementById('r-harvest').value = btn.dataset.harvest || '';",
          "  document.getElementById('r-qty').value = btn.dataset.qty || '1';",
          "  document.getElementById('r-grow').value = btn.dataset.grow || '120';",
          "  document.getElementById('recipe-form-title').textContent = 'Đang sửa công thức: ' + (btn.dataset.seed || '');",
          "  document.getElementById('recipe-submit-btn').textContent = 'Cập nhật công thức';",
          "  document.getElementById('recipe-form').scrollIntoView({ behavior: 'smooth' });",
          "}",
          "function resetRecipeForm() {",
          "  document.getElementById('recipe-form').reset();",
          "  document.getElementById('recipe-form-title').textContent = 'Thêm hoặc Sửa công thức gieo trồng';",
          "  document.getElementById('recipe-submit-btn').textContent = 'Lưu công thức trồng';",
          "}",
          "function editBasePrice(btn) {",
          "  switchTab('shop');",
          "  document.getElementById('p-code').value = btn.dataset.code || '';",
          "  document.getElementById('p-base').value = btn.dataset.base || '0';",
          "  document.getElementById('p-shop').checked = btn.dataset.shop === '1';",
          "  document.getElementById('price-form-title').textContent = 'Đặt giá gốc cho: ' + (btn.dataset.name || btn.dataset.code);",
          "  document.getElementById('price-form').scrollIntoView({ behavior: 'smooth' });",
          "}",
          "</script>",
        ].join("\n");

        const pageHtml = [
          "<!doctype html>",
          '<html lang="vi">',
          "<head>",
          '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          "  <title>Quản Trị — Hoạ Đồ</title>",
          "  <style>",
          "    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 16px; }",
          "    .container { max-width: 940px; margin: 0 auto; }",
          "    .tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }",
          "    .tab-btn { flex: 1; min-width: 120px; padding: 11px; border-radius: 10px; border: 1px solid #334155; background: #1e293b; color: #cbd5e1; font-weight: 700; font-size: 14px; cursor: pointer; margin-top: 0; }",
          "    .tab-btn.active { background: #f59e0b; color: #0f172a; border-color: #f59e0b; }",
          "    .tab-panel { display: none; }",
          "    .tab-panel.active { display: block; }",
          "    .card { background: #1e293b; padding: 18px; border-radius: 12px; margin-bottom: 18px; }",
          "    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }",
          "    label { display: block; font-size: 13px; color: #cbd5e1; margin-bottom: 4px; }",
          "    input, select { width: 100%; padding: 9px 10px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; font-size: 14px; }",
          "    .btn-submit { background: #f59e0b; color: #0f172a; font-weight: 700; border: none; padding: 11px 18px; border-radius: 8px; cursor: pointer; margin-top: 12px; font-size: 15px; }",
          "    .btn-reset { background: #334155; color: #f8fafc; font-weight: 600; border: none; padding: 11px 14px; border-radius: 8px; cursor: pointer; margin-top: 12px; margin-left: 8px; font-size: 14px; }",
          "    .btn-edit { background: #38bdf8; color: #0f172a; font-weight: 700; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; margin-top: 0; }",
          "    table { width: 100%; border-collapse: collapse; font-size: 14px; }",
          "    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #334155; }",
          "    th { color: #94a3b8; font-weight: 600; }",
          "    .notice { background: #065f46; color: #d1fae5; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; }",
          "  </style>",
          "</head>",
          "<body>",
          '  <div class="container">',
          '    <h2 style="margin:0 0 12px">Hoạ Đồ — Trang Quản Trị</h2>',
          saved
            ? '    <div class="notice">Đã lưu dữ liệu và cập nhật hệ thống thành công!</div>'
            : "",
          '    <div class="tabs">',
          `      <button type="button" id="btn-tab-items" class="tab-btn ${activeTab === "items" ? "active" : ""}" onclick="switchTab('items')">1. Vật phẩm (${items.length})</button>`,
          `      <button type="button" id="btn-tab-recipes" class="tab-btn ${activeTab === "recipes" ? "active" : ""}" onclick="switchTab('recipes')">2. Công thức trồng (${recipes.length})</button>`,
          `      <button type="button" id="btn-tab-shop" class="tab-btn ${activeTab === "shop" ? "active" : ""}" onclick="switchTab('shop')">3. Shop &amp; Biến động</button>`,
          "    </div>",
          `    <div id="panel-items" class="tab-panel ${activeTab === "items" ? "active" : ""}">`,
          '      <form id="item-form" class="card" method="POST" action="/admin/save">',
          '        <h3 id="item-form-title" style="margin-top:0">Thêm mới hoặc Cập nhật vật phẩm</h3>',
          `        <input type="hidden" name="password" value="${pwAttr}" />`,
          '        <div class="grid">',
          "          <div><label>Mã vật phẩm (code)</label><input type=\"text\" id=\"f-code\" name=\"code\" required /></div>",
          "          <div><label>Tên hiển thị</label><input type=\"text\" id=\"f-name\" name=\"name\" required /></div>",
          "          <div><label>Độ hiếm</label><select id=\"f-rarity\" name=\"rarity\"><option value=\"Thường\">Thường</option><option value=\"Hiếm\">Hiếm</option><option value=\"Sử Thi\">Sử Thi</option><option value=\"Truyền Thuyết\">Truyền Thuyết</option></select></div>",
          "          <div><label>Tỉ lệ rơi (%)</label><input type=\"number\" id=\"f-pct\" name=\"drop_percent\" step=\"0.01\" min=\"0\" max=\"100\" required /></div>",
          "        </div>",
          '        <div style="margin-top:12px"><label>Mô tả vật phẩm</label><input type="text" id="f-desc" name="description" /></div>',
          '        <div style="margin-top:12px"><label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="f-active" name="is_active" checked style="width:auto" /> Đang kích hoạt (cho phép rơi khi !pray)</label></div>',
          '        <button type="submit" id="item-submit-btn" class="btn-submit">Lưu vật phẩm</button>',
          '        <button type="button" class="btn-reset" onclick="resetItemForm()">Nhập mới</button>',
          "      </form>",
          '      <div class="card">',
          `        <h3 style="margin-top:0">Danh sách vật phẩm (Tổng tỉ lệ rơi: ${totalPctLabel}%)</h3>`,
          '        <div style="overflow-x:auto"><table><thead><tr><th>Mã</th><th>Tên</th><th>Độ hiếm</th><th>Tỉ lệ</th><th>Trạng thái</th><th>Mô tả</th><th>Thao tác</th></tr></thead><tbody>',
          rowsHtml ||
            '<tr><td colspan="7" style="color:#94a3b8">Chưa có vật phẩm nào.</td></tr>',
          "        </tbody></table></div></div>",
          "    </div>",
          `    <div id="panel-recipes" class="tab-panel ${activeTab === "recipes" ? "active" : ""}">`,
          '      <form id="recipe-form" class="card" method="POST" action="/admin/save-recipe">',
          '        <h3 id="recipe-form-title" style="margin-top:0">Thêm hoặc Sửa công thức gieo trồng</h3>',
          `        <input type="hidden" name="password" value="${pwAttr}" />`,
          '        <div class="grid">',
          `          <div><label>Hạt giống (Item 1)</label><select id="r-seed" name="seed_item_code" required>${itemOptionsHtml}</select></div>`,
          `          <div><label>Nông sản thu hoạch (Item 2)</label><select id="r-harvest" name="harvest_item_code" required>${itemOptionsHtml}</select></div>`,
          '          <div><label>Số lượng nông sản thu</label><input type="number" id="r-qty" name="harvest_quantity" min="1" value="1" required /></div>',
          '          <div><label>Thời gian lớn (giây)</label><input type="number" id="r-grow" name="grow_seconds" min="5" value="120" required /></div>',
          "        </div>",
          '        <button type="submit" id="recipe-submit-btn" class="btn-submit" style="background:#10b981;color:#fff">Lưu công thức trồng</button>',
          '        <button type="button" class="btn-reset" onclick="resetRecipeForm()">Nhập mới</button>',
          "      </form>",
          '      <div class="card"><h3 style="margin-top:0">Danh sách công thức gieo trồng</h3><div style="overflow-x:auto"><table><thead><tr><th>Hạt giống (Item 1)</th><th>Nông sản (Item 2)</th><th>Sản lượng</th><th>Thời gian lớn</th><th>Thao tác</th></tr></thead><tbody>',
          recipeRowsHtml ||
            '<tr><td colspan="5" style="color:#94a3b8">Chưa có công thức gieo trồng nào.</td></tr>',
          "      </tbody></table></div></div>",
          "    </div>",
          `    <div id="panel-shop" class="tab-panel ${activeTab === "shop" ? "active" : ""}">`,
          '      <form class="card" method="POST" action="/admin/save-shop-config">',
          '        <h3 style="margin-top:0">Cấu hình chu kỳ biến động giá</h3>',
          `        <input type="hidden" name="password" value="${pwAttr}" />`,
          '        <div class="grid">',
          `          <div><label>Chu kỳ đổi giá (giây)</label><input type="number" name="cycle_seconds" min="10" value="${shopSnapshot.config.cycleSeconds}" required /></div>`,
          `          <div><label>Số lượng item ngẫu nhiên biến động</label><input type="number" name="random_item_count" min="0" value="${shopSnapshot.config.randomItemCount}" required /></div>`,
          `          <div><label>Khoảng tăng/giảm lớn nhất (%)</label><input type="number" name="max_change_percent" step="1" min="0" max="95" value="${shopSnapshot.config.maxChangePercent}" required /></div>`,
          "        </div>",
          '        <button type="submit" class="btn-submit" style="background:#10b981;color:#fff">Lưu cấu hình biến động</button>',
          "      </form>",
          '      <form id="price-form" class="card" method="POST" action="/admin/save-base-price">',
          '        <h3 id="price-form-title" style="margin-top:0">Thiết lập giá gốc &amp; trạng thái bán trong Shop</h3>',
          `        <input type="hidden" name="password" value="${pwAttr}" />`,
          '        <div class="grid">',
          `          <div><label>Chọn vật phẩm</label><select id="p-code" name="item_code" required>${itemOptionsHtml}</select></div>`,
          '          <div><label>Giá gốc (điểm — bán = 80%)</label><input type="number" id="p-base" name="base_price" min="0" value="0" required /></div>`,
          "        </div>",
          '        <div style="margin-top:12px"><label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="p-shop" name="shop_enabled" checked style="width:auto" /> Cho phép mua/bán vật phẩm này trong Shop</label></div>',
          '        <button type="submit" class="btn-submit">Lưu thiết lập Shop</button>',
          "      </form>",
          '      <div class="card"><h3 style="margin-top:0">Bảng giá gốc &amp; trạng thái bán</h3><div style="overflow-x:auto"><table><thead><tr><th>Vật phẩm</th><th>Giá gốc</th><th>Bán chuẩn (80%)</th><th>Trạng thái</th><th>Giá chu kỳ hiện tại</th><th>Thao tác</th></tr></thead><tbody>',
          shopPriceRowsHtml ||
            '<tr><td colspan="6" style="color:#94a3b8">Chưa có vật phẩm nào.</td></tr>',
          "      </tbody></table></div></div>",
          "    </div>",
          "  </div>",
          clientScript,
          "</body>",
          "</html>",
        ].join("\n");

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(pageHtml);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
    })
    .listen(port, () => {
      console.log(`Server & trang quan tri dang chay tai cong ${port}`);
    });
}
