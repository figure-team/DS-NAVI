package app.billing;

import app.billing.BillingService;
import app.billing.BillingRepository;
import app.shipping.BillingHelper;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/billing")
public class BillingController {

  private BillingService billingService;
  private BillingRepository billingRepository;
  private BillingHelper billingHelper;

  @GetMapping
  public String list() {
    return billingService.list();
  }
}
