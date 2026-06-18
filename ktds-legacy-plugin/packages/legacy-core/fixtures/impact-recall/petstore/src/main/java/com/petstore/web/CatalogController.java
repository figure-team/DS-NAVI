package com.petstore.web;

import com.petstore.service.CatalogService;
import com.petstore.domain.Product;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/catalog")
public class CatalogController {

  @Autowired
  private CatalogService catalogService;

  @GetMapping("/{id}")
  public Product viewProduct(int id) {
    return catalogService.find(id);
  }
}
