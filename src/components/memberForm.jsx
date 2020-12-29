import React from "react";
import Joi from "joi-browser";
import Form from "./common/form";
import { getMember, saveMember } from "../services/memberService";
import auth from "../services/authService";
//import "./sellerForm.scss";

class MemberForm extends Form {
  state = {
    data: {
      name: "",
      number: "",
      email: "",
      denomination: "",
    },
    errors: {},
  };

  schema = {
    _id: Joi.string(),
    name: Joi.string().required().min(5).max(50).label("Name"),
    number: Joi.number()
      .required()
      .min(1)
      .max(9999999999)
      .label("Phone Number"),
    email: Joi.string().required().email().label("Email"),
    denomination: Joi.string().required().min(4).max(20).label("Denomination"),
  };

  //   async populateGenres() {
  //     const { data: genres } = await getGenres();
  //     this.setState({ genres });
  //   }

  async populateMember() {
    try {
      const memberId = this.props.match.params.id;
      if (memberId === "new") return;

      const { data: member } = await getMember(memberId);
      this.setState({ data: this.mapToViewModel(member) });
    } catch (ex) {
      if (ex.response && ex.response.status === 404)
        this.props.history.replace("/not-found");
    }
  }

  async componentDidMount() {
    await this.populateMember();
  }

  mapToViewModel(member) {
    return {
      _id: member._id,
      name: member.name,
      number: member.number,
      email: member.email,
      denomination: member.denomination,
    };
  }

  doSubmit = async () => {
    await saveMember(this.state.data);
    let user = auth.getCurrentUser();

    if (user && (user = user.isAdmin)) this.props.history.push("/members");
    else this.props.history.replace("/");
  };

  render() {
    return (
      <div className="container">
        <div className="content">
          <h1>Become A Member</h1>
          <div className="form">
            <div className="form-group">
              <form onSubmit={this.handleSubmit}>
                {this.renderInput("name", "Name")}
                {this.renderInput("number", "Phone Number")}
                {this.renderInput("email", "Email")}
                {this.renderInput("denomination", "Denomination")}
                <div className="buttons">
                  <div className="b-con">{this.renderButton("Save")}</div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default MemberForm;
