export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
        <span className="text-xl font-bold tracking-tight">🍜 BữaViet</span>
        <div className="hidden md:flex gap-8 text-sm text-gray-600">
          <a href="#menu" className="hover:text-gray-900 transition-colors">Thực đơn</a>
          <a href="#why" className="hover:text-gray-900 transition-colors">Tại sao chọn chúng tôi</a>
          <a href="#contact" className="hover:text-gray-900 transition-colors">Liên hệ</a>
        </div>
        <button className="bg-orange-500 text-white text-sm px-5 py-2 rounded-full hover:bg-orange-600 transition-colors">
          Đặt ngay
        </button>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 pt-24 pb-20">
        <span className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-4">
          Ưu đãi hôm nay — Miễn phí giao hàng đơn từ 99k
        </span>
        <h1 className="text-5xl md:text-6xl font-extrabold leading-tight max-w-3xl">
          Đồ ăn ngon.<br />Giao tận cửa.
        </h1>
        <p className="mt-6 text-lg text-gray-500 max-w-xl">
          Hàng trăm món từ cơm, bún, phở đến pizza, burger — tất cả từ các nhà hàng uy tín gần bạn.
          Đặt dễ, giao nhanh, ngon đảm bảo.
        </p>
        <div className="mt-10 flex gap-4 flex-wrap justify-center">
          <button className="bg-orange-500 text-white px-7 py-3 rounded-full text-sm font-medium hover:bg-orange-600 transition-colors">
            Đặt món ngay
          </button>
          <button className="border border-gray-200 px-7 py-3 rounded-full text-sm font-medium hover:border-gray-400 transition-colors">
            Xem thực đơn
          </button>
        </div>
      </section>

      {/* Menu */}
      <section id="menu" className="bg-gray-50 px-8 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-14">Món nổi bật hôm nay</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {dishes.map((d) => (
              <div key={d.name} className="bg-white rounded-2xl p-7 shadow-sm border border-gray-100 flex flex-col">
                <div className="text-5xl mb-5 text-center">{d.icon}</div>
                <h3 className="font-semibold text-lg mb-1">{d.name}</h3>
                <p className="text-gray-500 text-sm leading-relaxed flex-1">{d.desc}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-orange-500 font-bold text-lg">{d.price}</span>
                  <button className="bg-orange-500 text-white text-xs px-4 py-2 rounded-full hover:bg-orange-600 transition-colors">
                    Đặt ngay
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
          <h2 className="text-3xl font-bold text-center mb-14">Tại sao chọn BữaViet?</h2>
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
      <section id="contact" className="flex flex-col items-center text-center px-6 py-24 bg-orange-50">
        <h2 className="text-4xl font-extrabold max-w-xl">
          Đói rồi? Đặt ngay thôi!
        </h2>
        <p className="mt-4 text-gray-500 max-w-md">
          Chỉ vài cú click, món ăn yêu thích sẽ có mặt tại nhà bạn trong vòng 30 phút.
        </p>
        <button className="mt-8 bg-orange-500 text-white px-8 py-4 rounded-full text-sm font-medium hover:bg-orange-600 transition-colors">
          Đặt món miễn phí ship
        </button>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-8 py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} BữaViet. Đồ ăn ngon — Giao nhanh 30 phút.
      </footer>
    </main>
  );
}

const dishes = [
  {
    icon: "🍜",
    name: "Phở bò tái",
    desc: "Nước dùng hầm xương 12 tiếng, thịt bò mềm, bánh phở dai. Kèm rau thơm và tương ớt.",
    price: "65.000đ",
  },
  {
    icon: "🍱",
    name: "Cơm tấm sườn bì",
    desc: "Sườn nướng than hoa, bì trộn, chả trứng. Cơm tấm đúng vị Sài Gòn với nước mắm đặc trưng.",
    price: "55.000đ",
  },
  {
    icon: "🍔",
    name: "Burger bò Wagyu",
    desc: "Bò Wagyu tươi xay tay, phô mai Cheddar chảy, rau sống giòn. Bánh mì mềm nướng bơ.",
    price: "89.000đ",
  },
];

const reasons = [
  { icon: "⚡", title: "Giao trong 30 phút", desc: "Tài xế gần nhất nhận đơn, giao siêu tốc" },
  { icon: "🍽️", title: "Hơn 500 món", desc: "Đa dạng ẩm thực từ Bắc vào Nam và quốc tế" },
  { icon: "💳", title: "Thanh toán dễ", desc: "Tiền mặt, chuyển khoản, ví điện tử đều được" },
  { icon: "⭐", title: "Đánh giá thực", desc: "Hàng nghìn đánh giá thật từ khách hàng đã dùng" },
];
