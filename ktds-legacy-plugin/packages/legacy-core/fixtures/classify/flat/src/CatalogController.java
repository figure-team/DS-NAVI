package src;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/catalog")
public class CatalogController {

  private CatalogService catalogService;

  @GetMapping
  public String list() {
    return catalogService.list();
  }
}
