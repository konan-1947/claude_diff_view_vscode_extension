export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
        <span className="text-xl font-bold tracking-tight">AutoViet</span>
        <div className="hidden md:flex gap-8 text-sm text-gray-600">
          <a href="#products" className="hover:text-gray-900 transition-colors">Xe nổi bật</a>
          <a href="#why" className="hover:text-gray-900 transition-colors">Tại sao chọn chúng tôi</a>
          <a href="#contact" className="hover:text-gray-900 transition-colors">Liên hệ</a>
        </div>
        <button className="bg-black text-white text-sm px-5 py-2 rounded-full hover:bg-gray-800 transition-colors">
          Đặt lịch lái thử
        </button>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 pt-24 pb-20">
        <span className="text-xs font-semibold uppercase tracking-widest text-indigo-600 mb-4">
          Ưu đãi tháng 3 — Giảm đến 50 triệu đồng
        </span>
        <h1 className="text-5xl md:text-6xl font-extrabold leading-tight max-w-3xl">
          Xe ô tô chính hãng.<br />Giá tốt nhất thị trường.
        </h1>
        <p className="mt-6 text-lg text-gray-500 max-w-xl">
          Sedan, SUV, bán tải — đầy đủ dòng xe từ các thương hiệu hàng đầu.
          Bảo hành chính hãng, hỗ trợ vay trả góp toàn quốc.
        </p>
        <div className="mt-10 flex gap-4 flex-wrap justify-center">
          <button className="bg-black text-white px-7 py-3 rounded-full text-sm font-medium hover:bg-gray-800 transition-colors">
            Xem xe ngay
          </button>
          <button className="border border-gray-200 px-7 py-3 rounded-full text-sm font-medium hover:border-gray-400 transition-colors">
            Tư vấn miễn phí
          </button>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="bg-gray-50 px-8 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-14">Xe nổi bật</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {products.map((p) => (
              <div key={p.name} className="bg-white rounded-2xl p-7 shadow-sm border border-gray-100 flex flex-col">
                <div className="text-5xl mb-5 text-center">{p.icon}</div>
                <h3 className="font-semibold text-lg mb-1">{p.name}</h3>
                <p className="text-gray-500 text-sm leading-relaxed flex-1">{p.desc}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-indigo-600 font-bold text-lg">{p.price}</span>
                  <button className="bg-black text-white text-xs px-4 py-2 rounded-full hover:bg-gray-800 transition-colors">
                    Đặt cọc
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section id="why" className="px-8 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-14">Tại sao chọn AutoViet?</h2>
          <div className="grid md:grid-cols-4 gap-6 text-center">
            {reasons.map((r) => (
              <div key={r.title} className="flex flex-col items-center gap-3">
                <div className="text-4xl">{r.icon}</div>
                <h3 className="font-semibold">{r.title}</h3>
                <p className="text-gray-500 text-sm">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="contact" className="flex flex-col items-center text-center px-6 py-24 bg-indigo-50">
        <h2 className="text-4xl font-extrabold max-w-xl">
          Chưa biết chọn xe nào?
        </h2>
        <p className="mt-4 text-gray-500 max-w-md">
          Đội ngũ tư vấn của chúng tôi sẵn sàng giúp bạn chọn đúng dòng xe theo nhu cầu và ngân sách.
        </p>
        <button className="mt-8 bg-indigo-600 text-white px-8 py-4 rounded-full text-sm font-medium hover:bg-indigo-700 transition-colors">
          Nhận tư vấn miễn phí
        </button>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-8 py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} AutoViet. Xe chính hãng — Hỗ trợ vay trả góp toàn quốc.
      </footer>
    </main>
  );
}

const products = [
  {
    icon: "🚗",
    name: "Sedan hạng C",
    desc: "Thiết kế thanh lịch, tiết kiệm nhiên liệu, nội thất cao cấp. Lý tưởng cho gia đình và công sở.",
    price: "Từ 650.000.000đ",
  },
  {
    icon: "🚙",
    name: "SUV 7 chỗ",
    desc: "Gầm cao, không gian rộng, động cơ mạnh mẽ. Chinh phục mọi địa hình từ đô thị đến off-road.",
    price: "Từ 950.000.000đ",
  },
  {
    icon: "🛻",
    name: "Bán tải",
    desc: "Thùng xe rộng, tải trọng lớn, khung gầm cứng cáp. Phù hợp kinh doanh và vùng nông thôn.",
    price: "Từ 750.000.000đ",
  },
];

const reasons = [
  { icon: "✅", title: "Xe chính hãng", desc: "100% xe nhập khẩu và lắp ráp có giấy tờ đầy đủ" },
  { icon: "🚗", title: "Lái thử miễn phí", desc: "Đặt lịch lái thử tại nhà hoặc showroom tiện lợi" },
  { icon: "🛠️", title: "Bảo hành 5 năm", desc: "Bảo hành chính hãng, bảo dưỡng định kỳ tại xưởng" },
  { icon: "💰", title: "Hỗ trợ trả góp", desc: "Lãi suất 0% trong 12 tháng, thủ tục đơn giản" },
];
