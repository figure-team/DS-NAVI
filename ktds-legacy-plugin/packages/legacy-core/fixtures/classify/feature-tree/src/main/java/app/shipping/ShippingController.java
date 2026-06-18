package app.shipping;

import app.shipping.ShippingService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/shipping")
public class ShippingController {

  private ShippingService shippingService;

  @GetMapping
  public String list() {
    return shippingService.list();
  }
}
