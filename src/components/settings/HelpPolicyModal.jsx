import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ShieldCheck, CircleHelp } from "lucide-react";

const policies = [
  {
    title: "1. Quy định về tài khoản và bảo mật",
    items: [
      "Người dùng cần đăng ký, đăng nhập bằng tài khoản hợp lệ theo hướng dẫn của hệ thống.",
      "Thông tin cá nhân cung cấp khi đăng ký cần chính xác để phục vụ việc quản lý tài khoản và xử lý đơn hàng.",
      "Người dùng có trách nhiệm bảo mật thông tin đăng nhập và không chia sẻ tài khoản cho người khác sử dụng trái phép.",
      "Mỗi người dùng cần sử dụng tài khoản đúng mục đích, không giả mạo danh tính, lợi dụng tài khoản khác hoặc thực hiện hành vi gây ảnh hưởng đến hoạt động của hệ thống.",
      "Canteen VWA có thể xem xét hạn chế hoặc tạm khóa tài khoản theo quy trình quản lý khi phát hiện dấu hiệu gian lận, lạm dụng ưu đãi hoặc vi phạm quy chế. Việc xử lý cần căn cứ vào tính chất và mức độ vi phạm."
    ]
  },
  {
    title: "2. Quy định về thực đơn và đặt món",
    items: [
      "Người dùng có thể xem thực đơn, thông tin món ăn, giá bán và các chương trình ưu đãi được hiển thị trên hệ thống.",
      "Trước khi xác nhận đặt món, người dùng cần kiểm tra kỹ món ăn, số lượng, giá tiền, thông tin nhận món và tổng giá trị đơn hàng.",
      "Đơn hàng chỉ được ghi nhận khi hệ thống xác nhận đặt hàng thành công.",
      "Khả năng đặt món phụ thuộc vào tình trạng kinh doanh, số lượng món còn lại và thời gian nhận đơn được áp dụng tại canteen.",
      "Người dùng nên đặt món sớm để canteen có thời gian chuẩn bị, đặc biệt trong các khung giờ cao điểm trước và trong giờ nghỉ trưa.",
      "Khi phát hiện thông tin đơn hàng chưa chính xác, người dùng cần kiểm tra trạng thái đơn và liên hệ nhân viên canteen để được hướng dẫn xử lý."
    ]
  },
  {
    title: "3. Quy định về hủy đơn và xử lý hoàn tiền",
    items: [
      "Việc hủy đơn phụ thuộc vào trạng thái đơn hàng và quy trình xử lý đơn đang được áp dụng trên hệ thống.",
      "Người dùng cần kiểm tra trạng thái đơn trước khi thực hiện yêu cầu hủy. Đơn hàng đã được tiếp nhận, đang chuẩn bị hoặc đã hoàn tất có thể không còn đủ điều kiện hủy.",
      "Trường hợp đơn hàng đủ điều kiện hủy, việc cập nhật trạng thái và xử lý khoản tiền liên quan được thực hiện theo quy trình thanh toán của hệ thống.",
      "Người dùng không nên tự tạo nhiều đơn thay thế khi chưa xác định được trạng thái đơn hàng trước đó. Nếu phát sinh giao dịch hoặc trạng thái bất thường, hãy liên hệ nhân viên canteen để được kiểm tra."
    ]
  },
  {
    title: "4. Quy định về thanh toán và ví Canteen",
    items: [
      "Người dùng cần kiểm tra tổng tiền, thông tin đơn hàng và phương thức thanh toán được cung cấp trên giao diện trước khi xác nhận giao dịch.",
      "Các phương thức thanh toán được áp dụng là những phương thức đang được hệ thống hỗ trợ và hiển thị tại thời điểm đặt hàng.",
      "Đối với giao dịch qua ví Canteen, người dùng cần kiểm tra số dư và thông tin giao dịch trước khi thanh toán.",
      "Không cung cấp mật khẩu, mã xác thực hoặc thông tin bảo mật cho người khác. Không thực hiện thanh toán theo yêu cầu từ các tài khoản không xác minh được.",
      "Khi giao dịch thất bại, bị trừ tiền nhưng đơn hàng chưa được xác nhận, hoặc số dư hiển thị không chính xác, người dùng cần lưu lại thông tin giao dịch và liên hệ bộ phận phụ trách để được kiểm tra.",
      "Việc điều chỉnh, hoàn trả hoặc xử lý số dư được thực hiện theo chức năng hiện có của hệ thống và quy trình quản lý tài chính của canteen."
    ]
  },
  {
    title: "5. Quy định về nhận món và theo dõi đơn hàng",
    items: [
      "Sau khi đặt món thành công, người dùng cần theo dõi trạng thái đơn hàng trên Canteen VWA.",
      "Khi đến nhận món, người dùng thực hiện theo hướng dẫn của canteen và cung cấp mã đơn hàng hoặc mã QR nếu giao diện hệ thống có hỗ trợ.",
      "Người dùng nên nhận món đúng thời gian đã lựa chọn hoặc theo hướng dẫn của nhân viên canteen.",
      "Khi nhận món, cần kiểm tra món ăn và số lượng. Nếu có nhầm lẫn, thiếu món hoặc vấn đề về chất lượng, hãy phản hồi với nhân viên canteen sớm nhất có thể.",
      "Đối với đơn hàng đã hoàn tất, người dùng có thể sử dụng chức năng đánh giá nếu chức năng này được cung cấp cho đơn hàng đó."
    ]
  },
  {
    title: "6. Quy định về voucher và chương trình ưu đãi",
    items: [
      "Voucher, mã giảm giá và chương trình khuyến mãi được áp dụng theo điều kiện hiển thị trên hệ thống.",
      "Người dùng cần kiểm tra thời hạn, giá trị ưu đãi, điều kiện đơn hàng và các giới hạn sử dụng trước khi áp dụng.",
      "Giá trị ưu đãi thực tế được xác định theo thông tin hiển thị khi đặt hàng và thanh toán.",
      "Không sử dụng nhiều tài khoản hoặc thực hiện hành vi gian lận nhằm trục lợi từ voucher, khuyến mãi hay các chương trình tích điểm, nếu có.",
      "Canteen VWA có quyền kiểm tra và xử lý các trường hợp sử dụng ưu đãi không đúng quy định."
    ]
  },
  {
    title: "7. Quy định về đánh giá và phản hồi",
    items: [
      "Người dùng nên đưa ra đánh giá dựa trên trải nghiệm thực tế đối với món ăn và dịch vụ.",
      "Nội dung đánh giá cần trung thực, rõ ràng, lịch sự và có tính xây dựng.",
      "Không đăng tải nội dung xúc phạm, đe dọa, phân biệt đối xử, quảng cáo không liên quan hoặc thông tin sai lệch có chủ đích.",
      "Canteen VWA có thể xem xét ẩn hoặc xử lý nội dung vi phạm và áp dụng biện pháp phù hợp theo quy định quản lý hệ thống.",
      "Các phản hồi về chất lượng món ăn, giao nhận hoặc thanh toán nên nêu rõ vấn đề gặp phải để thuận tiện cho việc kiểm tra và cải thiện dịch vụ."
    ]
  },
  {
    title: "8. Quy định chung",
    items: [
      "Người dùng có trách nhiệm tuân thủ hướng dẫn sử dụng và các thông báo được công bố trên Canteen VWA.",
      "Canteen có thể cập nhật thực đơn, giá bán, tình trạng món ăn và chương trình ưu đãi tùy theo hoạt động thực tế.",
      "Những vấn đề chưa được quy định cụ thể sẽ được xem xét dựa trên trạng thái giao dịch, chức năng hiện có của hệ thống và quy trình quản lý của canteen.",
      "Khi quy chế được cập nhật, người dùng nên theo dõi thông báo trên hệ thống để nắm được nội dung thay đổi."
    ]
  }
];

const faqs = [
  {
    q: "Làm thế nào để đặt món?",
    a: "Đăng nhập Canteen VWA, mở thực đơn, chọn món và số lượng, thêm món vào giỏ hàng, kiểm tra thông tin đơn hàng rồi thực hiện các bước xác nhận theo hướng dẫn trên màn hình."
  },
  {
    q: "Làm sao biết đơn hàng đã được ghi nhận?",
    a: "Kiểm tra thông báo sau khi đặt hàng và mục đơn hàng của bạn. Chỉ coi đơn hàng là thành công khi hệ thống xác nhận hoặc hiển thị trạng thái tương ứng."
  },
  {
    q: "Tôi có thể sửa hoặc hủy đơn hàng sau khi đặt không?",
    a: "Điều này phụ thuộc vào trạng thái đơn hàng và chức năng được cung cấp. Hãy kiểm tra đơn hàng trước khi thao tác. Nếu không có tùy chọn phù hợp, bạn nên liên hệ nhân viên canteen để được hướng dẫn."
  },
  {
    q: "Tôi phải làm gì khi thanh toán thành công nhưng đơn hàng chưa cập nhật?",
    a: "Hãy lưu lại thông tin hoặc mã giao dịch nếu có, kiểm tra lại trạng thái đơn hàng và liên hệ bộ phận phụ trách. Không nên thanh toán lặp lại ngay khi chưa xác định kết quả giao dịch trước đó."
  },
  {
    q: "Vì sao voucher không áp dụng được?",
    a: "Voucher có thể không đáp ứng điều kiện sử dụng, đã hết hạn, không áp dụng cho món hàng hoặc đơn hàng hiện tại, hoặc đã đạt giới hạn sử dụng. Hãy kiểm tra thông tin voucher và thông báo của hệ thống."
  },
  {
    q: "Tôi có thể đánh giá món ăn khi nào?",
    a: "Bạn có thể sử dụng chức năng đánh giá khi hệ thống cho phép đối với đơn hàng hoặc món ăn tương ứng. Nội dung đánh giá nên phản ánh trải nghiệm thực tế và sử dụng ngôn từ lịch sự."
  },
  {
    q: "Tôi cần làm gì khi thông tin tài khoản hoặc số dư ví không chính xác?",
    a: "Kiểm tra lại thông tin trên hệ thống, lưu lại bằng chứng liên quan nếu có và liên hệ bộ phận phụ trách để được xác minh. Không chia sẻ mật khẩu hoặc mã xác thực trong quá trình hỗ trợ."
  },
  {
    q: "Tôi liên hệ ai khi gặp sự cố?",
    a: "Trước tiên, hãy kiểm tra thông báo và trạng thái trên Canteen VWA. Với các vấn đề về món ăn, nhận món, đơn hàng hoặc thanh toán, hãy liên hệ nhân viên canteen hoặc bộ phận quản lý theo kênh liên hệ chính thức của nhà trường/canteen."
  }
];

export default function HelpPolicyModal({ onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="vwa-help-overlay" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <section
        className="vwa-help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vwa-help-title"
      >
        <header className="vwa-help-header">
          <div className="vwa-help-heading-icon">
            <ShieldCheck size={25} />
          </div>
          <div className="vwa-help-heading-text">
            <span className="vwa-help-eyebrow">CANTEEN VWA</span>
            <h2 id="vwa-help-title">Trợ giúp &amp; Quy chế</h2>
            <p>Hướng dẫn sử dụng dịch vụ dành cho người dùng</p>
          </div>
          <button
            type="button"
            className="vwa-help-close"
            onClick={onClose}
            aria-label="Đóng cửa sổ trợ giúp"
          >
            <X size={22} />
          </button>
        </header>

        <div className="vwa-help-content">
          <div className="vwa-help-intro">
            <p className="vwa-help-main-title">
              TRỢ GIÚP &amp; QUY CHẾ SỬ DỤNG DỊCH VỤ CANTEEN VWA
            </p>
            <p>
              Chào mừng bạn đến với Canteen VWA – hệ thống hỗ trợ tra cứu thực
              đơn, đặt món và sử dụng các dịch vụ canteen dành cho cộng đồng nhà
              trường. Để quá trình đặt món và nhận món diễn ra thuận tiện, vui
              lòng đọc các hướng dẫn và quy định dưới đây.
            </p>
          </div>

          <section className="vwa-help-section">
            <h3><ShieldCheck size={19} /> I. QUY CHẾ SỬ DỤNG DỊCH VỤ</h3>
            {policies.map((policy) => (
              <article className="vwa-help-article" key={policy.title}>
                <h4>{policy.title}</h4>
                <ul>
                  {policy.items.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </section>

          <section className="vwa-help-section">
            <h3><CircleHelp size={19} /> II. CÂU HỎI THƯỜNG GẶP (FAQ)</h3>
            <div className="vwa-help-faqs">
              {faqs.map((faq, index) => (
                <article className="vwa-help-faq" key={faq.q}>
                  <h4><span>{String(index + 1).padStart(2, "0")}</span>{faq.q}</h4>
                  <p>{faq.a}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="vwa-help-footer-note">
            Canteen VWA – Đặt món thuận tiện, nhận món chủ động, phục vụ cộng
            đồng nhà trường.
          </div>
        </div>

        <footer className="vwa-help-bottom">
          <span>Vui lòng đọc kỹ hướng dẫn trước khi sử dụng dịch vụ.</span>
          <button type="button" onClick={onClose}>Đã hiểu</button>
        </footer>
      </section>

      <style>{`
        .vwa-help-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(12, 22, 48, .62);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
          animation: vwaHelpFade .18s ease-out;
        }
        .vwa-help-modal {
          display: flex;
          flex-direction: column;
          width: min(790px, 100%);
          max-height: min(88dvh, 900px);
          overflow: hidden;
          background: #fff;
          color: #24324a;
          border: 1px solid #e4eaf5;
          border-radius: 20px;
          box-shadow: 0 24px 80px rgba(7, 24, 63, .28);
          animation: vwaHelpRise .22s ease-out;
        }
        .vwa-help-header {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 20px 24px;
          border-bottom: 1px solid #e8edf7;
          background: linear-gradient(115deg, #f0f5ff, #fff 78%);
        }
        .vwa-help-heading-icon {
          width: 48px;
          height: 48px;
          flex: 0 0 48px;
          display: grid;
          place-items: center;
          color: #2634d5;
          background: #e1e9ff;
          border-radius: 15px;
        }
        .vwa-help-heading-text { min-width: 0; flex: 1; }
        .vwa-help-eyebrow {
          display: block;
          margin-bottom: 4px;
          color: #5264d9;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.7px;
        }
        .vwa-help-heading-text h2 {
          margin: 0;
          color: #18284a;
          font-size: 21px;
          font-weight: 800;
          line-height: 1.35;
        }
        .vwa-help-heading-text p {
          margin: 4px 0 0;
          color: #71809a;
          font-size: 12px;
        }
        .vwa-help-close {
          display: grid;
          place-items: center;
          flex: 0 0 38px;
          width: 38px;
          height: 38px;
          padding: 0;
          color: #5e6b82;
          background: #fff;
          border: 1px solid #e2e8f2;
          border-radius: 12px;
          cursor: pointer;
        }
        .vwa-help-close:hover { color: #2634d5; background: #eef2ff; }
        .vwa-help-content {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 24px;
          scrollbar-width: thin;
          scrollbar-color: #c4cfea transparent;
        }
        .vwa-help-intro {
          padding: 17px 19px;
          margin-bottom: 28px;
          background: #f5f8ff;
          border: 1px solid #e4ebff;
          border-left: 4px solid #3447db;
          border-radius: 12px;
        }
        .vwa-help-intro p {
          margin: 0;
          color: #56647c;
          font-size: 13px;
          line-height: 1.8;
        }
        .vwa-help-intro .vwa-help-main-title {
          margin-bottom: 9px;
          color: #2438bd;
          font-size: 14px;
          font-weight: 800;
          line-height: 1.6;
        }
        .vwa-help-section { margin-top: 28px; }
        .vwa-help-section > h3 {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 0 0 20px;
          padding-bottom: 12px;
          color: #2438bd;
          font-size: 15px;
          font-weight: 800;
          line-height: 1.5;
          border-bottom: 1px solid #e6ebf5;
        }
        .vwa-help-article { margin: 0 0 23px; }
        .vwa-help-article h4 {
          margin: 0 0 9px;
          color: #253653;
          font-size: 13.5px;
          font-weight: 750;
          line-height: 1.6;
        }
        .vwa-help-article ul {
          margin: 0;
          padding-left: 21px;
          color: #58667b;
          font-size: 13px;
          line-height: 1.85;
        }
        .vwa-help-article li { padding-left: 3px; margin: 5px 0; }
        .vwa-help-article li::marker { color: #6578df; }
        .vwa-help-faqs { display: grid; gap: 12px; }
        .vwa-help-faq {
          padding: 15px 16px;
          background: #fff;
          border: 1px solid #e8edf5;
          border-radius: 12px;
        }
        .vwa-help-faq h4 {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin: 0 0 8px;
          color: #293956;
          font-size: 13px;
          font-weight: 750;
          line-height: 1.65;
        }
        .vwa-help-faq h4 span {
          flex: 0 0 29px;
          display: inline-grid;
          place-items: center;
          height: 25px;
          color: #3447cb;
          background: #edf1ff;
          border-radius: 7px;
          font-size: 10px;
          font-weight: 800;
        }
        .vwa-help-faq p {
          margin: 0;
          padding-left: 39px;
          color: #66738a;
          font-size: 12.5px;
          line-height: 1.8;
        }
        .vwa-help-footer-note {
          margin-top: 26px;
          padding: 17px;
          color: #2c42bf;
          background: linear-gradient(110deg, #eef3ff, #f5fbff);
          border-radius: 12px;
          text-align: center;
          font-size: 13px;
          font-weight: 750;
          line-height: 1.7;
        }
        .vwa-help-bottom {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 24px;
          background: #fff;
          border-top: 1px solid #e8edf5;
        }
        .vwa-help-bottom span { color: #7a879b; font-size: 11px; line-height: 1.5; }
        .vwa-help-bottom button {
          flex: 0 0 auto;
          padding: 10px 23px;
          color: #fff;
          background: #2634d5;
          border: 0;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: background .15s ease, transform .15s ease;
        }
        .vwa-help-bottom button:hover { background: #1c29b8; }
        .vwa-help-bottom button:active { transform: scale(.98); }
        @keyframes vwaHelpFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes vwaHelpRise {
          from { opacity: 0; transform: translateY(10px) scale(.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (max-width: 600px) {
          .vwa-help-overlay { padding: 0; align-items: flex-end; }
          .vwa-help-modal {
            width: 100%;
            max-height: 94dvh;
            border-radius: 19px 19px 0 0;
            border-bottom: 0;
          }
          .vwa-help-header { gap: 10px; padding: 15px 16px; }
          .vwa-help-heading-icon {
            width: 40px; height: 40px; flex-basis: 40px; border-radius: 12px;
          }
          .vwa-help-heading-text h2 { font-size: 17px; }
          .vwa-help-heading-text p { font-size: 11px; line-height: 1.5; }
          .vwa-help-close { width: 34px; height: 34px; flex-basis: 34px; }
          .vwa-help-content { padding: 17px 16px 22px; }
          .vwa-help-intro { padding: 14px; margin-bottom: 22px; }
          .vwa-help-intro p { font-size: 12.5px; }
          .vwa-help-intro .vwa-help-main-title { font-size: 13px; }
          .vwa-help-section { margin-top: 23px; }
          .vwa-help-section > h3 { font-size: 13px; margin-bottom: 16px; }
          .vwa-help-article h4 { font-size: 13px; }
          .vwa-help-article ul { font-size: 12.5px; padding-left: 18px; }
          .vwa-help-faq { padding: 12px; }
          .vwa-help-faq h4 { font-size: 12.5px; }
          .vwa-help-faq p { padding-left: 0; font-size: 12px; }
          .vwa-help-bottom { padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); }
          .vwa-help-bottom span { max-width: 65%; }
          .vwa-help-bottom button { padding: 10px 17px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .vwa-help-overlay, .vwa-help-modal { animation: none; }
        }
      `}</style>
    </div>,
    document.body
  );
}
