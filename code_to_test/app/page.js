"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Home;
function Home() {
    return (<main className="min-h-screen bg-white text-gray-900">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
        <span className="text-xl font-bold tracking-tight">TechStore</span>
        <div className="hidden md:flex gap-8 text-sm text-gray-600">
          <a href="#products" className="hover:text-gray-900 transition-colors">Sản phẩm</a>
          <a href="#why" className="hover:text-gray-900 transition-colors">Tại sao chọn chúng tôi</a>
          <a href="#contact" className="hover:text-gray-900 transition-colors">Liên hệ</a>
        </div>
        <button className="bg-black text-white text-sm px-5 py-2 rounded-full hover:bg-gray-800 transition-colors">
          Mua ngay
        </button>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 pt-24 pb-20">
        <span className="text-xs font-semibold uppercase tracking-widest text-indigo-600 mb-4">
          Ưu đãi tháng 3 — Giảm đến 30%
        </span>
        <h1 className="text-5xl md:text-6xl font-extrabold leading-tight max-w-3xl">
          Máy tính chính hãng.<br />Giá tốt nhất thị trường.
        </h1>
        <p className="mt-6 text-lg text-gray-500 max-w-xl">
          Laptop, PC, workstation — đầy đủ dòng sản phẩm từ các thương hiệu hàng đầu.
          Bảo hành chính hãng, giao hàng toàn quốc.
        </p>
        <div className="mt-10 flex gap-4 flex-wrap justify-center">
          <button className="bg-black text-white px-7 py-3 rounded-full text-sm font-medium hover:bg-gray-800 transition-colors">
            Xem sản phẩm
          </button>
          <button className="border border-gray-200 px-7 py-3 rounded-full text-sm font-medium hover:border-gray-400 transition-colors">
            Tư vấn miễn phí
          </button>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="bg-gray-50 px-8 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-14">Sản phẩm nổi bật</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {products.map((p) => (<div key={p.name} className="bg-white rounded-2xl p-7 shadow-sm border border-gray-100 flex flex-col">
                <div className="text-5xl mb-5 text-center">{p.icon}</div>
                <h3 className="font-semibold text-lg mb-1">{p.name}</h3>
                <p className="text-gray-500 text-sm leading-relaxed flex-1">{p.desc}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-indigo-600 font-bold text-lg">{p.price}</span>
                  <button className="bg-black text-white text-xs px-4 py-2 rounded-full hover:bg-gray-800 transition-colors">
                    Mua ngay
                  </button>
                </div>
              </div>))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section id="why" className="px-8 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-14">Tại sao chọn TechStore?</h2>
          <div className="grid md:grid-cols-4 gap-6 text-center">
            {reasons.map((r) => (<div key={r.title} className="flex flex-col items-center gap-3">
                <div className="text-4xl">{r.icon}</div>
                <h3 className="font-semibold">{r.title}</h3>
                <p className="text-gray-500 text-sm">{r.desc}</p>
              </div>))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="contact" className="flex flex-col items-center text-center px-6 py-24 bg-indigo-50">
        <h2 className="text-4xl font-extrabold max-w-xl">
          Chưa biết chọn máy nào?
        </h2>
        <p className="mt-4 text-gray-500 max-w-md">
          Đội ngũ tư vấn của chúng tôi sẵn sàng giúp bạn chọn đúng cấu hình theo nhu cầu và ngân sách.
        </p>
        <button className="mt-8 bg-indigo-600 text-white px-8 py-4 rounded-full text-sm font-medium hover:bg-indigo-700 transition-colors">
          Nhận tư vấn miễn phí
        </button>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-8 py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} TechStore. Bảo hành chính hãng — Giao hàng toàn quốc.
      </footer>
    </main>);
}
const products = [
    {
        icon: "💻",
        name: "Laptop văn phòng",
        desc: "Mỏng nhẹ, pin trâu, màn hình Full HD. Phù hợp làm việc và học tập hàng ngày.",
        price: "Từ 12.990.000đ",
    },
    {
        icon: "🖥️",
        name: "PC Gaming",
        desc: "CPU Intel Core i7/i9, RTX 4070, RAM 32GB. Chiến mọi tựa game AAA ở setting tối đa.",
        price: "Từ 25.990.000đ",
    },
    {
        icon: "⚙️",
        name: "Workstation",
        desc: "Dành cho đồ họa, render 3D, AI. Cấu hình mạnh, ổn định 24/7 cho dân chuyên nghiệp.",
        price: "Từ 45.990.000đ",
    },
];
const reasons = [
    { icon: "✅", title: "Hàng chính hãng", desc: "100% sản phẩm có tem bảo hành nhà sản xuất" },
    { icon: "🚚", title: "Giao hàng nhanh", desc: "Giao trong 24h nội thành, 3 ngày toàn quốc" },
    { icon: "🛠️", title: "Bảo hành tận nơi", desc: "Hỗ trợ kỹ thuật và bảo hành tại nhà" },
    { icon: "💰", title: "Giá tốt nhất", desc: "Cam kết hoàn tiền nếu tìm được giá rẻ hơn" },
];
//# sourceMappingURL=page.js.map