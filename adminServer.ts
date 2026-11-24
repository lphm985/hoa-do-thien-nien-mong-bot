import http from "node:http";
import { URLSearchParams } from "node:url";
import { supabase } from "./supabase.js";
import { getActiveItems } from "./items.js";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

export function startAdminAndHealthServer(): void {
  const port = process.env.PORT || 3000;

  http
    .createServer(async (req, res) => {
      const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      // 1. Giữ cổng healthcheck cho UptimeRobot (GET & HEAD)
      if ((req.method === "GET" || req.method === "HEAD") && reqUrl.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        if (req.method === "HEAD") {
          res.end();
        } else {
          res.end("Bot Hoa Do Thien Nien Mong dang hoat dong!");
        }
        return;
      }

      // 2. Lưu vật phẩm
      if (req.method === "POST" && reqUrl.pathname === "/admin/save") {
        try {
          const form = await readFormBody(req);
          const password = form.get("password") ?? "";
          if (!checkPassword(password)) {
            res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
            res.end("<h3>Sai mật khẩu quản trị! <a href='/admin'>Quay lại</a></h3>");
            return;
          }

          const code = (form.get("code") ?? "").trim().toLowerCase();
          const name = (form.get("name") ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
          const rarity = (form.get("rarity") ?? "Thường").trim();
          const dropPercent = Number(form.get("drop_percent") ?? "0");
          const description = (form.get("description") ?? "").trim();
          const isActive = form.get("is_active") === "on";

          if (!code || !name || Number.isNaN(dropPercent) || dropPercent < 0 || dropPercent > 100) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end("<h3>Dữ liệu không hợp lệ. <a href='javascript:history.back()'>Quay lại</a></h3>");
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
            res.end(`<h3>Lỗi lưu Supabase: ${escapeHtml(error.message)}</h3>`);
            return;
          }

          await getActiveItems(true);

          res.writeHead(302, {
            Location: `/admin?pw=${encodeURIComponent(password)}&saved=1`,
          });
          res.end();
        } catch (err) {
          console.error("Lỗi xử lý form admin:", err);
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Lỗi máy chủ khi lưu dữ liệu.");
        }
        return;
      }

      // 3. Lưu công thức trồng trọt (Hạt giống -> Nông sản + Thời gian lớn)
      if (req.method === "POST" && reqUrl.pathname === "/admin/save-recipe") {
        try {
          const form = await readFormBody(req);
          const password = form.get("password") ?? "";
          if (!checkPassword(password)) {
            res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
            res.end("<h3>Sai mật khẩu quản trị! <a href='/admin'>Quay lại</a></h3>");
            return;
          }

          const seedCode = (form.get("seed_item_code") ?? "").trim().toLowerCase();
          const harvestCode = (form.get("harvest_item_code") ?? "").trim().toLowerCase();
          const harvestQty = Math.max(1, Number.parseInt(form.get("harvest_quantity") ?? "1", 10) || 1);
          const growSeconds = Math.max(5, Number.parseInt(form.get("grow_seconds") ?? "120", 10) || 120);

          if (!seedCode || !harvestCode) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end("<h3>Vui lòng nhập đầy đủ mã hạt giống và mã nông sản. <a href='javascript:history.back()'>Quay lại</a></h3>");
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
            res.end(`<h3>Lỗi lưu công thức (hãy đảm bảo cả 2 mã vật phẩm đều đã tồn tại trong danh sách vật phẩm): ${escapeHtml(error.message)}</h3>`);
            return;
          }

          res.writeHead(302, {
            Location: `/admin?pw=${encodeURIComponent(password)}&saved=1`,
          });
          res.end();
        } catch (err) {
          console.error("Lỗi lưu recipe:", err);
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Lỗi máy chủ khi lưu công thức.");
        }
        return;
      }

      // 4. Giao diện trang quản trị /admin
      if (req.method === "GET" && reqUrl.pathname === "/admin") {
        const pw = reqUrl.searchParams.get("pw") ?? "";
        const saved = reqUrl.searchParams.get("saved") === "1";

        if (!checkPassword(pw)) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Đăng nhập Quản Trị</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 16px; }
    .card { background: #1e293b; padding: 24px; border-radius: 12px; width: 100%; max-width: 360px; }
    input, button { width: 100%; padding: 10px 12px; margin-top: 12px; border-radius: 8px; border: 1px solid #334155; box-sizing: border-box; font-size: 15px; }
    input { background: #0f172a; color: #fff; }
    button { background: #f59e0b; color: #0f172a; font-weight: 700; border: none; cursor: pointer; }
  </style>
</head>
<body>
  <form class="card" method="GET" action="/admin">
    <h2 style="margin:0 0 8px">Hoạ Đồ — Quản Trị</h2>
    <p style="margin:0;color:#94a3b8;font-size:14px">Nhập mật khẩu ADMIN_PASSWORD để quản lý vật phẩm & ruộng.</p>
    <input type="password" name="pw" placeholder="Mật khẩu quản trị" required />
    <button type="submit">Mở trang quản lý</button>
  </form>
</body>
</html>`);
          return;
        }

        const [{ data: itemsData }, { data: recipesData }] = await Promise.all([
          supabase
            .from("discord_items")
            .select("code, name, rarity, drop_rate, description, is_active")
            .order("drop_rate", { ascending: false }),
          supabase
            .from("discord_crop_recipes")
            .select("seed_item_code, harvest_item_code, harvest_quantity, grow_seconds")
            .order("grow_seconds", { ascending: true }),
        ]);

        const items = itemsData ?? [];
        const recipes = recipesData ?? [];
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
            const pct = (Number(item.drop_rate ?? 0) * 100).toFixed(2).replace(/\.00$/, "");
            return `<tr>
              <td><code>${escapeHtml(item.code)}</code></td>
              <td><strong>${escapeHtml(item.name)}</strong></td>
              <td>${escapeHtml(item.rarity)}</td>
              <td>${pct}%</td>
              <td>${item.is_active ? "Đang bật" : "Đã ẩn"}</td>
              <td style="color:#94a3b8;font-size:13px">${escapeHtml(item.description ?? "")}</td>
            </tr>`;
          })
          .join("");

        const recipeRowsHtml = recipes
          .map((r) => {
            return `<tr>
              <td><code>${escapeHtml(r.seed_item_code)}</code></td>
              <td><code>${escapeHtml(r.harvest_item_code)}</code></td>
              <td>x${r.harvest_quantity}</td>
              <td><strong>${r.grow_seconds} giây</strong></td>
            </tr>`;
          })
          .join("");

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quản Lý Vật Phẩm & Trồng Trọt</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
    .container { max-width: 900px; margin: 0 auto; }
    .card { background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
    label { display: block; font-size: 13px; color: #cbd5e1; margin-bottom: 4px; }
    input, select { width: 100%; padding: 9px 10px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; font-size: 14px; }
    button { background: #f59e0b; color: #0f172a; font-weight: 700; border: none; padding: 11px 18px; border-radius: 8px; cursor: pointer; margin-top: 12px; font-size: 15px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-weight: 600; }
    .notice { background: #065f46; color: #d1fae5; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <h2 style="margin-top:0">Quản Lý Vật Phẩm & Gieo Trồng</h2>
    ${saved ? `<div class="notice">Đã lưu dữ liệu và làm mới hệ thống thành công!</div>` : ""}

    <form class="card" method="POST" action="/admin/save">
      <h3 style="margin-top:0">1. Thêm mới hoặc Cập nhật vật phẩm</h3>
      <input type="hidden" name="password" value="${escapeHtml(pw)}" />
      <div class="grid">
        <div>
          <label>Mã vật phẩm (code)</label>
          <input type="text" name="code" placeholder="vd: thanh_thuy_hat" required />
        </div>
        <div>
          <label>Tên hiển thị</label>
          <input type="text" name="name" placeholder="vd: Thanh Thủy hạt" required />
        </div>
        <div>
          <label>Độ hiếm</label>
          <select name="rarity">
            <option value="Thường">Thường</option>
            <option value="Hiếm">Hiếm</option>
            <option value="Sử Thi">Sử Thi</option>
            <option value="Truyền Thuyết">Truyền Thuyết</option>
          </select>
        </div>
        <div>
          <label>Tỉ lệ rơi (%)</label>
          <input type="number" name="drop_percent" step="0.01" min="0" max="100" placeholder="vd: 25 (nhập 0 nếu là nông sản)" required />
        </div>
      </div>
      <div style="margin-top:12px">
        <label>Mô tả vật phẩm</label>
        <input type="text" name="description" placeholder="Mô tả hiển thị trong !bag" />
      </div>
      <div style="margin-top:12px">
        <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" name="is_active" checked style="width:auto" />
          Đang kích hoạt (cho phép rơi khi !pray)
        </label>
      </div>
      <button type="submit">Lưu vật phẩm</button>
    </form>

    <form class="card" method="POST" action="/admin/save-recipe">
      <h3 style="margin-top:0">2. Công thức gieo trồng (Hạt giống → Nông sản & Thời gian lớn)</h3>
      <p style="color:#94a3b8;font-size:13px;margin-top:0">Tạo cả <strong>Hạt giống</strong> và <strong>Nông sản</strong> ở mục 1 trước (nông sản có thể đặt tỉ lệ rơi 0%), sau đó ghép công thức tại đây.</p>
      <input type="hidden" name="password" value="${escapeHtml(pw)}" />
      <div class="grid">
        <div>
          <label>Hạt giống (Item 1)</label>
          <select name="seed_item_code" required>${itemOptionsHtml}</select>
        </div>
        <div>
          <label>Nông sản thu hoạch (Item 2)</label>
          <select name="harvest_item_code" required>${itemOptionsHtml}</select>
        </div>
        <div>
          <label>Số lượng nông sản thu</label>
          <input type="number" name="harvest_quantity" min="1" value="1" required />
        </div>
        <div>
          <label>Thời gian lớn (giây)</label>
          <input type="number" name="grow_seconds" min="5" value="120" required />
        </div>
      </div>
      <button type="submit" style="background:#10b981;color:#fff">Lưu công thức trồng</button>
    </form>

    <div class="card">
      <h3 style="margin-top:0">Danh sách công thức gieo trồng</h3>
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>Hạt giống (Item 1)</th>
              <th>Nông sản (Item 2)</th>
              <th>Sản lượng</th>
              <th>Thời gian lớn</th>
            </tr>
          </thead>
          <tbody>
            ${recipeRowsHtml || `<tr><td colspan="4" style="color:#94a3b8">Chưa có công thức gieo trồng nào.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top:0">Danh sách vật phẩm hiện có (Tổng tỉ lệ rơi: ${totalPercent.toFixed(2).replace(/\.00$/, "")}%)</h3>
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>Mã (code)</th>
              <th>Tên vật phẩm</th>
              <th>Độ hiếm</th>
              <th>Tỉ lệ rơi</th>
              <th>Trạng thái</th>
              <th>Mô tả</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="6" style="color:#94a3b8">Chưa có vật phẩm nào.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>`);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
    })
    .listen(port, () => {
      console.log(`Server & trang quan tri dang chay tai cong ${port}`);
    });
}
