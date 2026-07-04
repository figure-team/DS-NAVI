package demo;

import org.springframework.web.client.RestTemplate;

public class ShadowService {
  public void a() {
    RestTemplate client = new RestTemplate();
    // 선언만 하고 호출 없음 — 항목이 생기면 안 된다.
    client.toString();
  }

  public void b() {
    com.foo.Widget client = com.foo.Shop.lookup();
    // 동명 변수의 무관한 exchange 호출 — RestTemplate 로 오탐되면 안 된다(바인딩 모호).
    client.exchange("X");
  }

  public void c() {
    // 도메인 빌더 — OkHttp Request.Builder 로 오탐되면 안 된다.
    Object o = new demo.PurchaseRequest.Builder().url("/internal/no-network").build();
  }
}
