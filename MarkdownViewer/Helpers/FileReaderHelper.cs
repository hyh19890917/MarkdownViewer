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
                    Encoding = MdEncoding.Gb18030
                };
            }
        }

        /// <summary>按指定编码写回 Markdown 文件（尽量保留原文件的 BOM/编码）。</summary>
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
            File.WriteAllText(filePath, text, enc);
        }
    }
}
