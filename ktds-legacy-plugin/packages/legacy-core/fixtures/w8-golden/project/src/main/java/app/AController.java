package app;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController
@RequestMapping(Const.BASE)
public class AController {
  private final BService svc = null;
  @GetMapping("/a")
  public String a() { if (svc != null) { return svc.hello(); } return "a"; }
}
