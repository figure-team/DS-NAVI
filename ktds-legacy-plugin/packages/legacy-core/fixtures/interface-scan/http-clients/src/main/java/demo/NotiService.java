package demo;

import org.springframework.web.reactive.function.client.WebClient;

public class NotiService {
  private final WebClient webClient = WebClient.create("https://noti.example.com");

  public void push(String body) {
    webClient.post().uri("/push").bodyValue(body).retrieve().toBodilessEntity().block();
  }

  public void legacySoap() throws Exception {
    org.apache.http.client.methods.HttpPost post =
        new org.apache.http.client.methods.HttpPost("https://legacy.example.com/soap");
  }
}
