package demo;

public class HomegrownHttp {
  public String call(String path) {
    // 사내 자체 HTTP 유틸 — 카탈로그 밖이라 탐지 불가. 의심 신호로는 잡혀야 한다.
    return HttpUtil.fetch("https://erp.example.com/api" + path);
  }

  public javax.sql.DataSource legacyDs() {
    return DsFactory.of("jdbc:oracle:thin:@10.0.0.9:1521:ERP");
  }
}
