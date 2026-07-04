package demo;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;

public class JdkCaller {
  public void callInventory() throws Exception {
    HttpRequest req =
        HttpRequest.newBuilder().uri(URI.create("https://inv.example.com/v2/stock")).GET().build();
    HttpClient.newHttpClient().send(req, java.net.http.HttpResponse.BodyHandlers.ofString());
  }
}
