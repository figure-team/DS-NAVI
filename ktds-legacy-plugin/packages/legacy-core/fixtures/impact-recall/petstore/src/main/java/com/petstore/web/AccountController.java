package com.petstore.web;

import com.petstore.service.AccountService;
import com.petstore.domain.Account;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/account")
public class AccountController {

  @Autowired
  private AccountService accountService;

  @GetMapping("/login")
  public Account login() {
    return accountService.find(1);
  }

  @PostMapping("/signon")
  public Account signon(Account account) {
    return accountService.register(account);
  }
}
