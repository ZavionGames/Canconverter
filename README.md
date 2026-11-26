# canconverter

![canconverter logosu](assets/logo.svg)

**canconverter**, farklı türde dosyaları aynı kuyrukta, doğrudan bilgisayarında dönüştüren Türkçe bir tarayıcı uygulamasıdır. Örneğin bir PDF’den yalnızca seçtiğin sayfaları alırken bir CSV dosyasını Excel çalışma kitabına çevirebilir, iki sonucu tek ZIP içinde indirebilirsin.

## Başlarken

1. Bu depoda **Code → Download ZIP** seçeneğiyle projeyi indir.
2. ZIP’in tamamını bir klasöre çıkar. `index.html` ile `assets` klasörü yan yana kalmalı.
3. `index.html` dosyasını Chrome veya Edge’de aç.
4. Dosyalarını sayfaya bırak. Her satırda çıktı biçimini seç, gerekirse **Ayarlar** bölümünü aç ve **Dönüştür** düğmesine bas.

İndirdikten sonra uygulamayı çevrimdışı kullanabilirsin. Node.js, yönetici izni veya yerel sunucu gerekmez. Dosyalar ve dönüşüm motorları cihazında kalır.

## Hangi dosyaları dönüştürebilirim?

Aşağıdaki tablo sık kullanılan örnekleri gösterir. Belirli bir dosyanın bütün hedeflerini görmek için uygulamada **Dönüşüm rehberi** bölümünden kaynak biçimini seç.

| Dosya türü | Örnek dönüşümler | Seçenekler |
| --- | --- | --- |
| PDF | PDF → TXT, DOCX, PNG, JPG veya PDF | `1-3,5` gibi bir sayfa aralığı seç. Birden fazla sayfayı görsele dönüştürürsen çıktıları ZIP olarak alırsın. |
| Belgeler ve e-kitaplar | DOCX, ODT, PPTX, EPUB veya RTF → PDF, TXT, HTML ve diğer metin biçimleri | Belge paragraflarını, slayt metnini veya kitap içeriğini aktar. |
| Tablolar | CSV → XLSX, XLS → ODS, XLSX → TSV veya JSON | Tek sayfalık çıktılar için çalışma sayfasını ve CSV ayracını seç. |
| Ses ve video | MP4 → WebM, MP4 → MP3, WAV → MP3 | Hedef biçime göre süre aralığını, kodeği, çözünürlüğü, ses kanalını veya bit hızını değiştir. |
| Görseller ve RAW | TIFF → JPG, PSD → PNG, PNG → ICO | Boyutlandır, döndür veya gri tonlamaya çevir. Çok kareli kaynaklarda kareyi seç. |
| Arşivler | ZIP ↔ TAR, ZIP ↔ TGZ, GZ → ZIP | İçeriği farklı bir arşiv biçiminde paketle. |
| Yazı tipleri | TTF veya OTF → WOFF, WOFF → özgün TTF veya OTF | Web ve masaüstü kullanımı arasında geçiş yap. |

## Üç yaygın kullanım

**Başvuru için en fazla 500 KB’lık JPG.** **Görsel düzenleyici** sekmesine görseli bırak ve **Başvuru dosyası** hızlı ayarını seç. Uygulama her denemede üretilen dosyanın gerçek boyutunu ölçer. Başarı sınırı 500.000 bayttır. Ölçülerin küçülmesine izin verip vermeyeceğine sen karar verirsin.

**PDF’den sayfa ayırma.** **Dosya dönüştürücü** sekmesinde PDF’yi ekle, hedefi **PDF** seç ve **Ayarlar → Sayfalar** alanına örneğin `2,4-6` yaz. Aynı sayfaları görüntü olarak kaydetmek için hedefi **PNG** veya **JPG** seç.

**Birden fazla görseli tek PDF’de toplama.** **Toplu görsel** sekmesinde dosyaları istediğin sayfa sırasıyla ekle. Her görselin çıktı biçimini ve gerekirse kalite, KB sınırı veya uzun kenar değerini seç. Kuyruğu dönüştürdükten sonra **PDF’de birleştir** düğmesine bas.

## Kapsam ve sınırlar

- PDF’den TXT veya DOCX almak için okunabilir bir metin katmanı gerekir. Taranmış sayfaları görüntü olarak dışa aktarabilirsin. OCR desteği yoktur.
- Office belgeleri ve e-kitaplardan yapılan metin dönüşümlerinde özgün slayt tasarımı, karmaşık sayfa düzeni ve makrolar korunmaz.
- Medya dosyaları için kaynak sınırı 256 MB’tır. **Görsel düzenleyici** ve **Toplu görsel** araçlarında dosya başına 50 MB, kenar başına 12.000 piksel ve toplam 24 megapiksel sınırı uygulanır.
- Şifreli arşivler desteklenmez. Medya kodeği ve RAW kamera modeli de dosyanın okunabilirliğini etkiler. Hatalar ilgili kuyruk satırında gösterilir.

## Projenin yapısı

Arayüzün giriş noktası [index.html](index.html), karma dosya kuyruğu [hub.js](hub.js), dönüşüm motorlarının kaydı [registry.js](registry.js) içindedir. Belge, tablo ve arşiv, görsel ve medya motorları ayrı JavaScript dosyalarında bulunur. Tarayıcı, gereken motoru yerel [assets/vendor](assets/vendor/) klasöründen yükler. Üçüncü taraf bileşenlerin lisans ve bildirim dosyaları da bu klasördedir.

## Doğrulama

Chrome’da internet erişimi kapalıyken aynı kuyruktaki PDF ve CSV dosyalarından TXT ve XLSX indirildi. Türkçe metin çıktısı ve ZIP içeriği kontrol edildi. WAV → MP3 ve MP4 → WebM dönüşümleri Chrome ve Edge’de denendi.

## Gizlilik

Dosyaların nasıl işlendiğini ve indirdiğin sonuçların nerede kaldığını [gizlilik politikasında](PRIVACY.md) okuyabilirsin.
