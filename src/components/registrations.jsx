import React, { Component } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import RegistrationTable from "./registerTable";
import Pagination from "./common/pagination";
import {
  getRegistrations,
  deleteRegistration,
} from "../services/registrationService";
import { paginate } from "../utils/paginate";
import _ from "lodash";
import SearchBox from "./common/searchBox";
//import "./registrations.scss";

class Registrations extends Component {
  state = {
    registrations: [],
    currentPage: 1,
    pageSize: 4,
    searchQuery: "",
    sortColumn: { path: "name", order: "asc" },
  };

  async componentDidMount() {
    // const { data } = await getGenres();
    // const genres = [{ _id: "", name: "All Genres" }, ...data];

    const { data: registrations } = await getRegistrations();
    this.setState({ registrations });
  }

  handleDelete = async (registration) => {
    const originalRegistrations = this.state.registrations;
    const registrations = originalRegistrations.filter(
      (r) => r._id !== registration._id
    );
    this.setState({ registrations });

    try {
      await deleteRegistration(registration._id);
    } catch (ex) {
      if (ex.response && ex.response.status === 404)
        toast.error("This registration has already been deleted.");

      this.setState({ registrations: originalRegistrations });
    }
  };

  handlePageChange = (page) => {
    this.setState({ currentPage: page });
  };

  handleSearch = (query) => {
    this.setState({ searchQuery: query, currentPage: 1 });
  };

  handleSort = (sortColumn) => {
    this.setState({ sortColumn });
  };

  getPagedData = () => {
    const {
      pageSize,
      currentPage,
      sortColumn,
      searchQuery,
      registrations: allRegistrations,
    } = this.state;

    let filtered = allRegistrations;
    if (searchQuery)
      filtered = allRegistrations.filter((r) =>
        r.name.toLowerCase().startsWith(searchQuery.toLowerCase())
      );
    //else if (selectedGenre && selectedGenre._id)
    //  filtered = allMovies.filter((r) => r.genre._id === selectedGenre._id);

    const sorted = _.orderBy(filtered, [sortColumn.path], [sortColumn.order]);

    const registrations = paginate(sorted, currentPage, pageSize);

    return { totalCount: filtered.length, data: registrations };
  };

  render() {
    const { length: count } = this.state.registrations;
    const { pageSize, currentPage, sortColumn, searchQuery } = this.state;

    if (count === 0) return <p>There are no registrations in the database.</p>;

    const { totalCount, data: registrations } = this.getPagedData();

    return (
      <div className="container">
        <div className="row">
          <h1>Registrations</h1>
          <div className="col">
            <div className="button">
              <Link
                to="/registrations/new"
                className="btn"
                style={{ marginBottom: 20 }}
              >
                New Registration
              </Link>
            </div>
            <p>Showing {totalCount} registrations in the database.</p>
            <SearchBox value={searchQuery} onChange={this.handleSearch} />
            <RegistrationTable
              className="content"
              registrations={registrations}
              sortColumn={sortColumn}
              onDelete={this.handleDelete}
              onSort={this.handleSort}
            />
            <Pagination
              itemsCount={totalCount}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={this.handlePageChange}
            />
          </div>
        </div>
      </div>
    );
  }
}

export default Registrations;
