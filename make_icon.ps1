Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies "System.Drawing.dll" -TypeDefinition @"
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;

public static class IconMaker
{
    public static void Make(string pngPath, string icoPath, int[] sizes)
    {
        using (var source = Image.FromFile(pngPath))
        {
            var frames = new List<byte[]>();
            foreach (int s in sizes)
            {
                byte[] frame;
                using (var bmp = new Bitmap(s, s, PixelFormat.Format32bppArgb))
                using (var g = Graphics.FromImage(bmp))
                {
                    g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                    g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
                    g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                    g.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighQuality;
                    g.Clear(Color.Transparent);
                    g.DrawImage(source, 0, 0, s, s);
                    using (var ms = new MemoryStream())
                    {
                        bmp.Save(ms, ImageFormat.Png);
                        frame = ms.ToArray();
                    }
                }
                frames.Add(frame);
            }

            int count = frames.Count;
            int offset = 6 + 16 * count;
            using (var ms = new MemoryStream())
            using (var bw = new BinaryWriter(ms))
            {
                bw.Write((ushort)0);
                bw.Write((ushort)1);
                bw.Write((ushort)count);
                for (int i = 0; i < count; i++)
                {
                    int s = sizes[i];
                    byte wh = (byte)(s >= 256 ? 0 : s);
                    bw.Write(wh);
                    bw.Write(wh);
                    bw.Write((byte)0);
                    bw.Write((byte)0);
                    bw.Write((ushort)1);
                    bw.Write((ushort)32);
                    bw.Write((uint)frames[i].Length);
                    bw.Write((uint)offset);
                    offset += frames[i].Length;
                }
                for (int i = 0; i < count; i++)
                {
                    bw.Write(frames[i]);
                }
                bw.Flush();
                File.WriteAllBytes(icoPath, ms.ToArray());
            }
        }
    }
}
"@

[IconMaker]::Make(
    "E:\Gitee_work_space\markdownviewer\icon.png",
    "E:\Gitee_work_space\markdownviewer\MarkdownViewer\app.ico",
    [int[]](16, 24, 32, 48, 64, 128, 256))

$fi = Get-Item "E:\Gitee_work_space\markdownviewer\MarkdownViewer\app.ico"
$icon = New-Object System.Drawing.Icon("E:\Gitee_work_space\markdownviewer\MarkdownViewer\app.ico")
"generated $([math]::Round($fi.Length/1KB,1)) KB, valid ICO $($icon.Width)x$($icon.Height)"
$icon.Dispose()