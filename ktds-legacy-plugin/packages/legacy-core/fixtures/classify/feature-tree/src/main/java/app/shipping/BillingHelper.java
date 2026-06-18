package app.shipping;

// 물리 위치는 shipping 디렉토리지만 도달성으로는 billing 루트만 닿는다 —
// 도달성(billing) vs 디렉토리(shipping) 신호 충돌 → ambiguous 큐로 가야 한다.
public class BillingHelper {
  public String tag() {
    return "billing-helper";
  }
}
