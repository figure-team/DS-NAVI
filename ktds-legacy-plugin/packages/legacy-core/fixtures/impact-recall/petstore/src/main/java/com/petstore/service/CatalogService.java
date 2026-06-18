package com.petstore.service;

import com.petstore.domain.Product;

public interface CatalogService {
  Product find(int id);
}
