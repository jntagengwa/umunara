import React from "react";
import Joi from "joi-browser";
import Form from "./common/form";
import { getRegister, saveRegister } from "../services/registerService";
import auth from "../services/authService";
//import "./sellerForm.scss";

class RegistrationForm extends Form {
  state = {
    data: {
      firstName: "",
      lastName: "",
      email: "",
      homeChurch: "",
      thoughts: "",
      hopes: "",
      getInvolved: "",
    },
    errors: {},
  };

  schema = {
    _id: Joi.string(),
    firstName: Joi.string().required().min(5).max(50).label("Name"),
    lastName: Joi.string().required().min(5).max(50).label("Name"),
    email: Joi.string().required().email().label("Email"),
    homeChurch: Joi.string().required().min(1).max(300).label("Home church"),
    thoughts: Joi.string().min(1).max(300).label("Your thoughts"),
    hopes: Joi.string().required().min(1).max(300).label(" Your hope"),
    getInvolved: Joi.string().required().min(4).max(20).label("Get involved"),
  };

  //   async populateGenres() {
  //     const { data: genres } = await getGenres();
  //     this.setState({ genres });
  //   }

  async populateRegister() {
    try {
      const registerId = this.props.match.params.id;
      if (registerId === "new") return;

      const { data: register } = await getMember(registerId);
      this.setState({ data: this.mapToViewModel(register) });
    } catch (ex) {
      if (ex.response && ex.response.status === 404)
        this.props.history.replace("/not-found");
    }
  }

  async componentDidMount() {
    await this.populateMember();
  }

  mapToViewModel(register) {
    return {
      _id: register._id,
      firstName: register.firstName,
      lastName: register.lastName,
      email: register.email,
      homeChurch: register.homeChurch,
      thoughts: register.thoughts,
      hopes: register.hopes,
      getInvolved: register.getInvolved,
    };
  }

  doSubmit = async () => {
    await saveRegister(this.state.data);
    let user = auth.getCurrentUser();

    if (user && (user = user.isAdmin)) this.props.history.push("/blog");
    else this.props.history.replace("/");
  };

  render() {
    return (
      <div className="container">
        <div className="content">
          <h1>Register For The Conference!</h1>
          <div className="form">
            <div className="form-group">
              <h1>
                “Therefore keep watch, because you do not know the day or the
                hour.”
              </h1>
              <form onSubmit={this.handleSubmit}>
                {this.renderInput("firstName", "First Name")}
                {this.renderInput("lastName", "Last Name")}
                {this.renderInput("email", "Email")}
                {this.renderInput("homeChurch", "Home Church")}
                {this.renderInput("thoughts", "Tell us your thoughts?")}
                {this.renderInput("hopes", "What do you hope to learn?")}
                {this.renderInput("getInvolved", "Yes or No", "text")}
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

export default RegistrationForm;
