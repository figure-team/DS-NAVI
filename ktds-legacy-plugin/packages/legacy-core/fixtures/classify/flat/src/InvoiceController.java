package src;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/invoice")
public class InvoiceController {

  private InvoiceService invoiceService;

  @GetMapping
  public String list() {
    return invoiceService.list();
  }
}
