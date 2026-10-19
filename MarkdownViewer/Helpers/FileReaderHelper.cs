using System.IO;
using System.Text;

namespace MarkdownViewer.Helpers
{
    /// <summary>
    /// Markdown 文件编码类别（保存时按原编码写回）。
    /// </summary>
    public enum MdEncoding
    {
        Utf8NoBom,
        Utf8Bom,
        Utf16LE,
        Utf16BE,
        Gb18030
    }

    /// <summary>读取结果：文本 + 探测到的编码。</summary>
    public class MdReadResult
    {
        public string Text { get; set; } = "";
        public MdEncoding Encoding { get; set; } = MdEncoding.Utf8NoBom;

        /// <summary>编码是“猜”的（无 BOM 且不是合法 UTF-8），保存前最好让用户确认。</summary>
        public bool Guessed { get; set; }
    }

    /// <summary>
    /// 读取 Markdown 文件并检测编码。
    /// BOM(UTF-8/UTF-16) -> 严格 UTF-8 -> GB18030。
    /// </summary>
    public static class FileReaderHelper
    {
        static FileReaderHelper()
        {
            // 注册 .NET Framework 时代的代码页（GB2312/GB18030 等）
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        }

        public static string ReadMarkdownFile(string filePath)
        {
            return ReadMarkdownFileEx(filePath).Text;
        }

        public static MdReadResult ReadMarkdownFileEx(string filePath)
        {
            var bytes = File.ReadAllBytes(filePath);
            return DecodeEx(bytes);
        }

        public static string Decode(byte[] bytes) => DecodeEx(bytes).Text;

        public static MdReadResult DecodeEx(byte[] bytes)
        {
            // UTF-8 BOM
            if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
                return new MdReadResult
                {
                    Text = Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3),
                    Encoding = MdEncoding.Utf8Bom
                };

            // UTF-16 LE/BE BOM
            if (bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE)
                return new MdReadResult
                {
                    Text = Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2),
                    Encoding = MdEncoding.Utf16LE
                };
            if (bytes.Length >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF)
                return new MdReadResult
                {
                    Text = Encoding.BigEndianUnicode.GetString(bytes, 2, bytes.Length - 2),
                    Encoding = MdEncoding.Utf16BE
                };

            // UTF-16 无 BOM：UTF-16 文本中零字节呈奇偶规律分布，UTF-8/GB18030 几乎没有零字节
            if (bytes.Length >= 4)
            {
                var sample = Math.Min(bytes.Length, 4096);
                var evenZero = 0;
                var oddZero = 0;
                for (var i = 0; i < sample; i++)
                {
                    if (bytes[i] != 0) continue;
                    if ((i & 1) == 0) evenZero++;
                    else oddZero++;
                }
                var pairs = sample / 2;
                if (pairs > 0)
                {
                    if (oddZero > pairs * 0.25 && evenZero < pairs * 0.05)
                        return new MdReadResult
                        {
                            Text = Encoding.Unicode.GetString(bytes),
                            Encoding = MdEncoding.Utf16LE,
                            Guessed = true
                        };
                    if (evenZero > pairs * 0.25 && oddZero < pairs * 0.05)
                        return new MdReadResult
                        {
                            Text = Encoding.BigEndianUnicode.GetString(bytes),
                            Encoding = MdEncoding.Utf16BE,
                            Guessed = true
                        };
                }
            }

            // 严格 UTF-8 解码：无 BOM 时只要不是合法 UTF-8 就按 GB18030 处理
            var strictUtf8 = new UTF8Encoding(false, throwOnInvalidBytes: true);
            try
            {
                return new MdReadResult
                {
                    Text = strictUtf8.GetString(bytes),
                    Encoding = MdEncoding.Utf8NoBom
                };
            }
            catch (DecoderFallbackException)
            {
                return new MdReadResult
                {
                    Text = Encoding.GetEncoding("GB18030").GetString(bytes),
                    Encoding = MdEncoding.Gb18030,
                    Guessed = true   // 可能是 GB18030，也可能是 Big5/Shift-JIS，需用户确认
                };
            }
        }

        /// <summary>编码的显示名称（用于状态栏与「编码」菜单）。</summary>
        public static string Name(MdEncoding encoding) => encoding switch
        {
            MdEncoding.Utf8Bom => "UTF-8 (BOM)",
            MdEncoding.Utf16LE => "UTF-16 LE",
            MdEncoding.Utf16BE => "UTF-16 BE",
            MdEncoding.Gb18030 => "GB18030",
            _ => "UTF-8"
        };

        /// <summary>按用户指定的编码解码原始字节（用于修正乱码）。</summary>
        public static string DecodeWith(MdEncoding encoding, byte[] bytes)
        {
            try
            {
                switch (encoding)
                {
                    case MdEncoding.Utf8Bom:
                        return bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF
                            ? Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3)
                            : Encoding.UTF8.GetString(bytes);
                    case MdEncoding.Utf16LE:
                        return bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE
                            ? Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2)
                            : Encoding.Unicode.GetString(bytes);
                    case MdEncoding.Utf16BE:
                        return bytes.Length >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF
                            ? Encoding.BigEndianUnicode.GetString(bytes, 2, bytes.Length - 2)
                            : Encoding.BigEndianUnicode.GetString(bytes);
                    case MdEncoding.Gb18030:
                        return Encoding.GetEncoding("GB18030").GetString(bytes);
                    default:
                        return new UTF8Encoding(false, throwOnInvalidBytes: false).GetString(bytes);
                }
            }
            catch (Exception)
            {
                return Encoding.UTF8.GetString(bytes);
            }
        }

        /// <summary>
        /// 按指定编码写回 Markdown 文件。
        /// 先写临时文件再原子替换，避免写到一半掉电/崩溃导致原文件损坏。
        /// </summary>
        public static void WriteMarkdownFile(string filePath, string text, MdEncoding encoding)
        {
            var enc = encoding switch
            {
                MdEncoding.Utf8Bom => new UTF8Encoding(true),
                MdEncoding.Utf16LE => Encoding.Unicode,
                MdEncoding.Utf16BE => Encoding.BigEndianUnicode,
                MdEncoding.Gb18030 => Encoding.GetEncoding("GB18030"),
                _ => new UTF8Encoding(false)
            };

            var tmp = filePath + ".tmp";
            File.WriteAllText(tmp, text, enc);
            try
            {
                if (File.Exists(filePath))
                    File.Replace(tmp, filePath, null, ignoreMetadataErrors: true);
                else
                    File.Move(tmp, filePath);
            }
            catch (Exception)
            {
                // 某些网络盘/非 NTFS 卷不支持 Replace，回落到覆盖写
                File.Copy(tmp, filePath, true);
                try { File.Delete(tmp); } catch { /* 忽略 */ }
            }
        }
    }
}
