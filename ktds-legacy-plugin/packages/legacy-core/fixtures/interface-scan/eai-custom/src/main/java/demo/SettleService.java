package demo;

import com.example.eai.EaiClient;

public class SettleService {
  private final EaiClient eaiClient = new EaiClient();

  public void settle(String payload) {
    eaiClient.send("EAI.SETTLE.REQ", payload);
  }

  public void unregisteredWrapper(String payload) {
    // 커스텀 등록이 없는 래퍼 — 잡히면 안 된다.
    new LegacyBus().publish("BUS.TOPIC", payload);
  }
}
