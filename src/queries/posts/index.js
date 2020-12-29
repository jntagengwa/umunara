import gql from "graphql-tag";

export const GET_POSTS_BY_TYPE_QUERY = gql`
  query GetBlogPostsByType($type: String) {
    posts: getPostsByType(type: $type) {
      id
      title
      description
      updated_at
      created_at
      author
      image
      categories
      text
    }
  }
`;
