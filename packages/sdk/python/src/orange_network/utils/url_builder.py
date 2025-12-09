"""URL building utilities"""

from typing import Any, Dict, Optional
from urllib.parse import urljoin, urlparse, urlencode, parse_qs


class UrlBuilder:
    """URL builder for constructing API URLs"""

    def __init__(self, base_url: str):
        """Initialize URL builder

        Args:
            base_url: Base URL for API endpoints
        """
        self.base_url = base_url.rstrip('/')
        self.path_parts = []
        self.query_params = {}
        self.fragment = None

    def path(self, *parts: str) -> "UrlBuilder":
        """Add path components

        Args:
            *parts: Path components to add

        Returns:
            Self for method chaining
        """
        self.path_parts.extend(parts)
        return self

    def segment(self, segment: str) -> "UrlBuilder":
        """Add a single path segment

        Args:
            segment: Path segment to add

        Returns:
            Self for method chaining
        """
        self.path_parts.append(segment.strip('/'))
        return self

    def param(self, key: str, value: Any) -> "UrlBuilder":
        """Add query parameter

        Args:
            key: Parameter name
            value: Parameter value

        Returns:
            Self for method chaining
        """
        if value is not None:
            self.query_params[key] = str(value)
        return self

    def params(self, params: Dict[str, Any]) -> "UrlBuilder":
        """Add multiple query parameters

        Args:
            params: Dictionary of parameters

        Returns:
            Self for method chaining
        """
        for key, value in params.items():
            if value is not None:
                self.query_params[key] = str(value)
        return self

    def filter_params(self, **filters: Any) -> "UrlBuilder":
        """Add filter parameters

        Args:
            **filters: Filter key-value pairs

        Returns:
            Self for method chaining
        """
        for key, value in filters.items():
            if value is not None:
                self.query_params[f"filter[{key}]"] = str(value)
        return self

    def sort(self, field: str, direction: str = "asc") -> "UrlBuilder":
        """Add sorting parameter

        Args:
            field: Field to sort by
            direction: Sort direction ("asc" or "desc")

        Returns:
            Self for method chaining
        """
        if direction.lower() not in ["asc", "desc"]:
            direction = "asc"

        self.query_params["sort"] = f"{field}:{direction}"
        return self

    def paginate(self, page: int, limit: int = 10) -> "UrlBuilder":
        """Add pagination parameters

        Args:
            page: Page number (1-based)
            limit: Items per page

        Returns:
            Self for method chaining
        """
        self.query_params["page"] = str(max(1, page))
        self.query_params["limit"] = str(max(1, min(100, limit)))
        return self

    def offset(self, offset: int, limit: int = 10) -> "UrlBuilder":
        """Add offset-based pagination

        Args:
            offset: Number of items to skip
            limit: Maximum number of items to return

        Returns:
            Self for method chaining
        """
        self.query_params["offset"] = str(max(0, offset))
        self.query_params["limit"] = str(max(1, min(100, limit)))
        return self

    def fields(self, *fields: str) -> "UrlBuilder":
        """Add field selection parameter

        Args:
            *fields: Fields to include in response

        Returns:
            Self for method chaining
        """
        self.query_params["fields"] = ",".join(fields)
        return self

    def include(self, *includes: str) -> "UrlBuilder":
        """Add include parameter for related resources

        Args:
            *includes: Resources to include

        Returns:
            Self for method chaining
        """
        self.query_params["include"] = ",".join(includes)
        return self

    def search(self, query: str) -> "UrlBuilder":
        """Add search parameter

        Args:
            query: Search query string

        Returns:
            Self for method chaining
        """
        if query:
            self.query_params["search"] = query
        return self

    def hash_fragment(self, fragment: str) -> "UrlBuilder":
        """Set URL hash fragment

        Args:
            fragment: Hash fragment without #

        Returns:
            Self for method chaining
        """
        self.fragment = fragment
        return self

    def build(self) -> str:
        """Build final URL

        Returns:
            Complete URL string
        """
        # Build base path
        url = self.base_url

        # Add path segments
        if self.path_parts:
            path = "/".join(str(part).strip('/') for part in self.path_parts if part)
            url = f"{url}/{path}"

        # Add query parameters
        if self.query_params:
            query_string = urlencode(sorted(self.query_params.items()))
            url = f"{url}?{query_string}"

        # Add fragment
        if self.fragment:
            url = f"{url}#{self.fragment}"

        return url

    def __str__(self) -> str:
        """String representation"""
        return self.build()

    def __repr__(self) -> str:
        """Developer representation"""
        return f"UrlBuilder(base_url='{self.base_url}', path_parts={self.path_parts}, query_params={self.query_params})"

    def reset(self) -> "UrlBuilder":
        """Reset builder state

        Returns:
            Self for method chaining
        """
        self.path_parts = []
        self.query_params = {}
        self.fragment = None
        return self

    def clone(self) -> "UrlBuilder":
        """Create a copy of this URL builder

        Returns:
            New UrlBuilder with same configuration
        """
        cloned = UrlBuilder(self.base_url)
        cloned.path_parts = self.path_parts.copy()
        cloned.query_params = self.query_params.copy()
        cloned.fragment = self.fragment
        return cloned

    @staticmethod
    def parse(url: str) -> "UrlBuilder":
        """Parse existing URL and create URL builder

        Args:
            url: URL to parse

        Returns:
            UrlBuilder instance with parsed components
        """
        parsed = urlparse(url)

        # Create builder with base URL (scheme + netloc)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
        builder = UrlBuilder(base_url)

        # Extract path segments
        if parsed.path:
            path_parts = [part for part in parsed.path.split('/') if part]
            builder.path_parts.extend(path_parts)

        # Extract query parameters
        if parsed.query:
            query_dict = parse_qs(parsed.query)
            # Flatten query dict (parse_qs returns lists)
            for key, values in query_dict.items():
                if values:
                    builder.query_params[key] = values[-1]  # Take last value

        # Set fragment
        if parsed.fragment:
            builder.fragment = parsed.fragment

        return builder