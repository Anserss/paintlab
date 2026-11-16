// 生成并编译「单文件启动器」：把 dist 全部文件嵌进一个 exe，双击即可在默认浏览器打开应用。
// 用法：node scripts/make-launcher.mjs  （产物：release/PIGMENT-DEPOT.exe）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const outDir = path.join(root, 'release');
const work = path.join(root, '.launcher-build');
const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('缺少 dist/index.html，请先执行 npm run build');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + entry.name : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, rel));
    else out.push({ rel, abs });
  }
  return out;
}

const files = walk(dist);
const entries = files.map((file, index) => {
  const url = '/' + file.rel.split(path.sep).join('/');
  const resource = 'web.' + String(index).padStart(2, '0') + '.' + file.rel.replace(/[\\/]/g, '.').replace(/[^A-Za-z0-9._-]/g, '_');
  const ext = path.extname(file.rel).toLowerCase();
  return { url, resource, abs: file.abs, mime: MIME[ext] || 'application/octet-stream' };
});

const dictFiles = entries.map((e) => '      { "' + e.url + '", "' + e.resource + '" },').join('\n');
const dictMime = [...new Set(entries.map((e) => e.mime))]
  .map((m) => {
    const exts = [...new Set(entries.filter((e) => e.mime === m).map((e) => path.extname(e.url).toLowerCase()))];
    return exts.map((x) => '      { "' + x + '", "' + m + '" },').join('\n');
  })
  .join('\n');

const cs = `// 自动生成，勿手改：PIGMENT DEPOT 单文件启动器
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;

internal static class Launcher
{
    private static readonly Dictionary<string, string> Files = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
${dictFiles}
    };

    private static readonly Dictionary<string, string> Mime = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
${dictMime}
    };

    private static int Main()
    {
        int port = FindFreePort(8787);
        var listener = new TcpListener(IPAddress.Loopback, port);
        try { listener.Start(); }
        catch (Exception error)
        {
            Console.Error.WriteLine("无法监听端口: " + error.Message);
            Console.Error.WriteLine("按任意键退出…");
            Console.ReadKey(true);
            return 1;
        }

        string url = "http://127.0.0.1:" + port + "/";
        Console.WriteLine();
        Console.WriteLine("  PIGMENT DEPOT · 漆料工作台");
        Console.WriteLine("  " + url);
        Console.WriteLine("  关闭此窗口即停止服务。");
        Console.WriteLine();

        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception error) { Console.WriteLine("未能自动打开浏览器（" + error.Message + "），请手动访问上面的地址。"); }

        ThreadPool.SetMinThreads(8, 8);
        while (true)
        {
            TcpClient client;
            try { client = listener.AcceptTcpClient(); }
            catch { break; }
            ThreadPool.QueueUserWorkItem(state => Serve((TcpClient)state), client);
        }
        return 0;
    }

    private static int FindFreePort(int start)
    {
        for (int port = start; port < start + 60; port++)
        {
            try
            {
                var probe = new TcpListener(IPAddress.Loopback, port);
                probe.Start();
                probe.Stop();
                return port;
            }
            catch { }
        }
        return start;
    }

    private static void Serve(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.ReceiveTimeout = 5000;
                using (var stream = client.GetStream())
                {
                    string requestLine = ReadLine(stream);
                    if (string.IsNullOrEmpty(requestLine)) return;
                    // 必须把请求头读空：直接关闭带未读数据的连接会触发 TCP RST，
                    // 浏览器侧表现为 ERR_CONNECTION_RESET（curl 单发请求看不出来）。
                    for (int i = 0; i < 64; i++)
                    {
                        string header = ReadLine(stream);
                        if (string.IsNullOrEmpty(header)) break;
                    }
                    string target = requestLine.Split(' ')[1];
                    int query = target.IndexOf('?');
                    if (query >= 0) target = target.Substring(0, query);
                    target = Uri.UnescapeDataString(target);

                    string key = target == "/" ? "/index.html" : target;
                    if (!Files.ContainsKey(key))
                    {
                        if (Path.HasExtension(key)) { Write(stream, "text/plain", Encoding.UTF8.GetBytes("not found")); return; }
                        key = "/index.html";
                    }

                    byte[] body = ReadResource(Files[key]);
                    if (body == null) { Write(stream, "text/plain", Encoding.UTF8.GetBytes("resource missing")); return; }
                    string mime;
                    if (!Mime.TryGetValue(Path.GetExtension(key), out mime)) mime = "application/octet-stream";
                    Write(stream, mime, body);
                }
            }
            catch { }
        }
    }

    private static string ReadLine(Stream stream)
    {
        var buffer = new StringBuilder();
        int read;
        while ((read = stream.ReadByte()) >= 0)
        {
            if (read == '\\n') break;
            if (read != '\\r') buffer.Append((char)read);
            if (buffer.Length > 4096) break;
        }
        return buffer.ToString();
    }

    private static byte[] ReadResource(string name)
    {
        var assembly = Assembly.GetExecutingAssembly();
        using (var stream = assembly.GetManifestResourceStream(name))
        {
            if (stream == null) return null;
            using (var memory = new MemoryStream())
            {
                stream.CopyTo(memory);
                return memory.ToArray();
            }
        }
    }

    private static void Write(Stream stream, string mime, byte[] body)
    {
        string header = "HTTP/1.1 200 OK\\r\\n"
            + "Content-Type: " + mime + "\\r\\n"
            + "Content-Length: " + body.Length + "\\r\\n"
            + "Cache-Control: no-store\\r\\n"
            + "Connection: close\\r\\n\\r\\n";
        byte[] head = Encoding.ASCII.GetBytes(header);
        stream.Write(head, 0, head.Length);
        stream.Write(body, 0, body.Length);
        stream.Flush();
        try { stream.Flush(); } catch { }
    }
}
`;

fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
fs.writeFileSync(path.join(work, 'Launcher.cs'), cs);
const rsp = [
  '/nologo',
  '/target:exe',
  '/platform:anycpu',
  '/optimize+',
  // 源码是 UTF-8：不指定 codepage 时旧版 csc 按 ANSI 解读，中文串会在 exe 里变成乱码
  '/codepage:65001',
  '/out:' + JSON.stringify(path.join(outDir, 'PIGMENT-DEPOT.exe')),
  ...(fs.existsSync(path.join(root, 'build', 'icon.ico')) ? ['/win32icon:' + JSON.stringify(path.join(root, 'build', 'icon.ico'))] : []),
  ...entries.map((e) => '/resource:' + JSON.stringify(e.abs) + ',' + e.resource),
  JSON.stringify(path.join(work, 'Launcher.cs')),
].join('\r\n');
fs.writeFileSync(path.join(work, 'build.rsp'), rsp);

fs.mkdirSync(outDir, { recursive: true });
try {
  execFileSync(CSC, ['@' + path.join(work, 'build.rsp')], { stdio: 'inherit' });
} catch (error) {
  console.error('csc 编译失败：' + error.message);
  process.exit(1);
}
const exe = path.join(outDir, 'PIGMENT-DEPOT.exe');
console.log('启动器: ' + exe + '  (' + (fs.statSync(exe).size / 1024 / 1024).toFixed(2) + ' MB)');
