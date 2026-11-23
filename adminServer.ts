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

      // 1. Giữ cổng healthcheck cho UptimeRobot / Render ở trang chủ "/"
      if (req.method === "GET" && reqUrl.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Bot Hoa Do Thien Nien Mong dang hoat dong!");
        return;
      }

      // 2. Xử lý lưu (thêm mới hoặc cập nhật) vật phẩm khi bấm nút Lưu
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
          const name = (form.get("name") ?? "").trim();
          const rarity = (form.get("rarity") ?? "Thường").trim();
          const dropPercent = Number(form.get("drop_percent") ?? "0");
          const description = (form.get("description") ?? "").trim();
          const isActive = form.get("is_active") === "on";

          if (!code || !name || Number.isNaN(dropPercent) || dropPercent < 0 || dropPercent > 100) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end("<h3>Dữ liệu không hợp lệ (kiểm tra lại mã, tên hoặc tỉ lệ 0-100%). <a href='javascript:history.back()'>Quay lại</a></h3>");
            return;
          }

          const dropRate = dropPercent / 100;

          const { error } = await supabase.from("discord_items").upsert(
            {
              code,
              name,
              rarity,
              drop_rate: dropRate,
              description,
              is_active: isActive,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "code" }
          );

          if (error) {
            console.error("Lỗi lưu discord_items từ trang admin:", error);
            res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`<h3>Lỗi lưu Supabase: ${escapeHtml(error.message)}</h3>`);
            return;
          }

          // Làm mới cache ngay lập tức để bot áp dụng luôn
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

      // 3. Trang giao diện quản lý vật phẩm tại "/admin"
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
  <title>Đăng nhập Quản Trị Vật Phẩm</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 16px; }
    .card { background: #1e293b; padding: 24px; border-radius: 12px; width: 100%; max-width: 360px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
    input, button { width: 100%; padding: 10px 12px; margin-top: 12px; border-radius: 8px; border: 1px solid #334155; box-sizing: border-box; font-size: 15px; }
    input { background: #0f172a; color: #fff; }
    button { background: #f59e0b; color: #0f172a; font-weight: 700; border: none; cursor: pointer; }
  </style>
</head>
<body>
  <form class="card" method="GET" action="/admin">
    <h2 style="margin:0 0 8px">Hoạ Đồ — Quản Trị</h2>
    <p style="margin:0;color:#94a3b8;font-size:14px">Nhập mật khẩu ADMIN_PASSWORD để quản lý kho vật phẩm.</p>
    <input type="password" name="pw" placeholder="Mật khẩu quản trị" required />
    <button type="submit">Mở trang quản lý</button>
  </form>
</body>
</html>`);
          return;
        }

        const { data } = await supabase
          .from("discord_items")
          .select("code, name, rarity, drop_rate, description, is_active")
          .order("drop_rate", { ascending: false });

        const items = data ?? [];
        const totalPercent = items
          .filter((i) => i.is_active)
          .reduce((sum, i) => sum + Number(i.drop_rate ?? 0) * 100, 0);

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

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quản Lý Vật Phẩm — Hoạ Đồ Thiên Niên Mộng</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
    .container { max-width: 860px; margin: 0 auto; }
    .card { background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    label { display: block; font-size: 13px; color: #cbd5e1; margin-bottom: 4px; }
    input, select, textarea { width: 100%; padding: 9px 10px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; font-size: 14px; }
    button { background: #f59e0b; color: #0f172a; font-weight: 700; border: none; padding: 11px 18px; border-radius: 8px; cursor: pointer; margin-top: 12px; font-size: 15px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-weight: 600; }
    .notice { background: #065f46; color: #d1fae5; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <h2 style="margin-top:0">Quản Lý Vật Phẩm Cầu Nguyện</h2>
    ${saved ? `<div class="notice">Đã lưu vật phẩm và làm mới danh sách cho bot thành công!</div>` : ""}

    <form class="card" method="POST" action="/admin/save">
      <h3 style="margin-top:0">Thêm mới hoặc Cập nhật vật phẩm</h3>
      <p style="color:#94a3b8;font-size:13px;margin-top:0">Nếu nhập trùng <strong>Mã vật phẩm (code)</strong> đã có, hệ thống sẽ tự động cập nhật thông tin món đó.</p>
      <input type="hidden" name="password" value="${escapeHtml(pw)}" />
      <div class="grid">
        <div>
          <label>Mã vật phẩm (viết liền không dấu)</label>
          <input type="text" name="code" placeholder="vd: linh_huong" required />
        </div>
        <div>
          <label>Tên hiển thị</label>
          <input type="text" name="name" placeholder="vd: Linh Hương Trầm" required />
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
          <input type="number" name="drop_percent" step="0.01" min="0" max="100" placeholder="vd: 25" required />
        </div>
      </div>
      <div style="margin-top:12px">
        <label>Mô tả vật phẩm</label>
        <input type="text" name="description" placeholder="Mô tả ngắn hiển thị trong !bag" />
      </div>
      <div style="margin-top:12px">
        <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" name="is_active" checked style="width:auto" />
          Đang kích hoạt (cho phép rơi khi !pray)
        </label>
      </div>
      <button type="submit">Lưu vật phẩm</button>
    </form>

    <div class="card">
      <h3 style="margin-top:0">Danh sách vật phẩm hiện có (Tổng tỉ lệ đang bật: ${totalPercent.toFixed(2).replace(/\.00$/, "")}%)</h3>
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
            ${rowsHtml || `<tr><td colspan="6" style="color:#94a3b8">Chưa có vật phẩm nào trong bảng discord_items.</td></tr>`}
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
        
