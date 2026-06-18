package com.petstore.persistence;

import com.petstore.domain.Product;

public interface ProductMapper {
  Product selectById(int id);
}
