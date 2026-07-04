package demo;

import org.springframework.http.HttpMethod;
import org.springframework.web.client.RestTemplate;

public class PayClient {
  private static final String NOTI_API = "https://noti.example.com";

  private final RestTemplate restTemplate = new RestTemplate();

  public String approve(PayRequest req) {
    return restTemplate.postForObject("https://pay.example.com/v1/approve", req, String.class);
  }

  public String status(String id) {
    return restTemplate.exchange(buildUrl(id), HttpMethod.POST, null, String.class).getBody();
  }

  public void ping() throws Exception {
    java.net.HttpURLConnection conn =
        (java.net.HttpURLConnection) new java.net.URL(NOTI_API + "/ping").openConnection();
    conn.getResponseCode();
  }

  private String buildUrl(String id) {
    return "https://pay.example.com/v1/" + id;
  }
}
