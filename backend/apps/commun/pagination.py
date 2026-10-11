from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class PaginationStandard(PageNumberPagination):
    page_size = 25
    page_size_query_param = "taille_page"
    max_page_size = 500

    def get_paginated_response(self, donnees):
        return Response(
            {
                "total": self.page.paginator.count,
                "page": self.page.number,
                "taille_page": self.get_page_size(self.request),
                "nombre_pages": self.page.paginator.num_pages,
                "resultats": donnees,
            }
        )
